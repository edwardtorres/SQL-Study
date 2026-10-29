import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, Play, Send, Timer } from 'lucide-react';
import { interviewItems } from '../data/interview';
import type { Challenge } from '../core/types';
import type { ItemMeta } from '../data/itemIndex';
import { loadItem } from '../data/items/loader';
import { sqlEngine } from '../engine/client';
import {
  checkpointProblem, closeProblem, deadlineOf, drawInterview, estimateComparison, finishInterview, forgetOpen, INTERVIEW_PROBLEMS, interviewReady,
  isExpired, isOffEstimate, OFF_ESTIMATE_SHARE, openProblem, recordInterviewFailure, recordInterviewPass, remainingMs, settleExpiredPass,
  SHORT_SET_MINUTES, SHORT_SET_PROBLEMS, startInterview,
} from '../game/interview';
import { emptyProgress, type InterviewProblem, type InterviewResult, type SaveV6 } from '../save/format';
import Workspace from './Workspace';

// A timed interview set. The page owns the clock and the grading; the rules are in src/game/interview.ts.
interface Props {
  save: SaveV6; items: readonly ItemMeta[]; today: string;
  commit: (next: SaveV6) => void;
  setDraft: (id: string, draft: string) => void;
  onBack: () => void;
}

// While a workspace is open, its time is counted at this interval, so a reload loses at most this much.
const CHECKPOINT_MS = 30_000;

const mmss = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const reserveChallenge = (id: string): Challenge | undefined => interviewItems.find((item) => item.id === id);

// The estimate and the time on one problem. A migrated result has no estimate, so its time is not shown.
function timeLine(problem: InterviewProblem): string {
  if (problem.estimateMinutes === null) return 'Time on this problem not recorded for this set.';
  const estimate = problem.estimateMinutes * 60_000;
  const note = problem.spentMs > estimate * (1 + OFF_ESTIMATE_SHARE) ? ' · over the estimate'
    : problem.spentMs < estimate * (1 - OFF_ESTIMATE_SHARE) ? ' · under the estimate' : '';
  return `Estimate ${problem.estimateMinutes} min · your time on it ${mmss(problem.spentMs)}${note}`;
}

export default function Interview({ save, items, today, commit, setDraft, onBack }: Props) {
  const set = save.interview;
  const running = set !== null;
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<string | null>(null);
  const [viewing, setViewing] = useState<InterviewResult | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const settling = useRef(false);
  // The checkpoint timer reads the latest save here, so a checkpoint never writes back an older save.
  const latest = useRef({ save, set });
  // A chapter 13 problem is not a reserve problem, so its definition loads when it is opened.
  const [loaded, setLoaded] = useState<{ id: string; challenge: Challenge } | null>(null);

  useEffect(() => {
    latest.current = { save, set };
  });

  useEffect(() => {
    if (open === null || reserveChallenge(open) || loaded?.id === open) return;
    let cancelled = false;
    void loadItem(open).then((challenge) => { if (!cancelled) setLoaded({ id: open, challenge }); });
    return () => { cancelled = true; };
  }, [open, loaded]);

  const titleOf = (id: string): string => reserveChallenge(id)?.title ?? items.find((item) => item.id === id)?.title ?? id;

  // The clock ticks while a set runs. A reload restarts the tick, and the deadline comes from the saved start time.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { window.clearInterval(timer); };
  }, [running]);

  // A workspace that is open counts its time at each checkpoint, and the open interval restarts at each one.
  useEffect(() => {
    if (open === null) return;
    const timer = window.setInterval(() => {
      const current = latest.current;
      if (current.set) commit({ ...current.save, interview: checkpointProblem(current.set, open, Date.now()) });
    }, CHECKPOINT_MS);
    return () => { window.clearInterval(timer); };
  }, [open, commit]);

  // A page that closed while a workspace was open leaves an open marker. It is cleared here without counting its time.
  useEffect(() => {
    if (open !== null || !set) return;
    if (set.problems.some((problem) => problem.openedAt !== null)) commit({ ...save, interview: forgetOpen(set) });
  }, [open, set, save, commit]);

  const expired = set !== null && isExpired(set, now);
  // When the timer ends the set, each unpassed problem is graded from its saved draft, once the engine is ready.
  // A set that expired while the page was closed is settled the same way when the page next opens.
  useEffect(() => {
    if (!set || !isExpired(set, now) || settling.current) return;
    settling.current = true;
    const deadline = deadlineOf(set);
    void (async () => {
      // A workspace open at the deadline is counted up to the deadline, not beyond it.
      let checked = open !== null ? closeProblem(set, open, deadline) : set;
      try {
        await sqlEngine.initialize();
        for (const problem of set.problems) {
          if (problem.passedAt !== null) continue;
          const graded = await sqlEngine.grade(problem.id, save.tickets[problem.id]?.draft ?? '').catch(() => null);
          if (graded?.report.passed) checked = settleExpiredPass(checked, problem.id);
        }
      } catch {
        setMessage('The engine could not check your drafts. Unpassed problems count as not passed.');
      }
      const finished = finishInterview(save, items, checked, deadline, today);
      commit(finished.save);
      setViewing(finished.result);
      setOpen(null);
      settling.current = false;
    })();
  }, [set, now, save, items, today, commit, open]);

  // The mistake explanations on the results page come from re-grading each problem's final draft, after the set ends.
  useEffect(() => {
    if (!viewing) return;
    let cancelled = false;
    void (async () => {
      for (const problem of viewing.problems) {
        if (problem.passedAt !== null) continue;
        const graded = await sqlEngine.grade(problem.id, save.tickets[problem.id]?.draft ?? '').catch(() => null);
        const explanation = graded?.report.mistake?.explanation;
        if (explanation && !cancelled) setExplanations((previous) => ({ ...previous, [problem.id]: explanation }));
      }
    })();
    return () => { cancelled = true; };
  }, [viewing, save.tickets]);

  const startSet = (short: boolean) => {
    const at = Date.now();
    const candidates = drawInterview(save, items, short ? SHORT_SET_PROBLEMS : INTERVIEW_PROBLEMS);
    commit({ ...save, interview: startInterview(candidates, at, short ? SHORT_SET_MINUTES : undefined) });
    setViewing(null); setOpen(null); setExplanations({}); setMessage('');
  };

  // Opening a problem starts its clock. A problem that has already passed is not timed again.
  const openWorkspace = (id: string) => {
    if (set) commit({ ...save, interview: openProblem(set, id, Date.now()) });
    setOpen(id);
  };

  // Leaving a workspace counts its time up to now.
  const leaveWorkspace = () => {
    if (set && open !== null) commit({ ...save, interview: closeProblem(set, open, Date.now()) });
    setOpen(null);
  };

  const attempt = (id: string, passed: boolean) => {
    if (!set) return;
    const at = Date.now();
    commit({ ...save, interview: passed ? recordInterviewPass(set, id, at) : recordInterviewFailure(set, id, at) });
  };

  const finishNow = () => {
    if (!set) return;
    const finished = finishInterview(save, items, set, Date.now(), today);
    commit(finished.save);
    setViewing(finished.result);
    setOpen(null);
  };

  const ready = interviewReady(save.interviewHistory);
  const readyLine = ready ? 'Interview-ready: two of your last three sets were passed in time.' : 'Not interview-ready yet. Two of your last three sets must be passed in time.';

  // A problem open in the workspace: interview rules apply, and the set's own clock decides when it ends.
  if (set && open) {
    const challenge = reserveChallenge(open) ?? (loaded?.id === open ? loaded.challenge : undefined);
    if (!challenge) return <div className="chapter-main"><p className="muted">Loading the ticket…</p></div>;
    const problem = set.problems.find((entry) => entry.id === open);
    return <Workspace
      key={open}
      challenge={challenge}
      code={`INT · ${set.problems.findIndex((entry) => entry.id === open) + 1} of ${set.problems.length}`}
      partLabel={undefined}
      backLabel="Interview set"
      progress={save.tickets[open] ?? emptyProgress(challenge.starterSql)}
      setDraft={(draft) => { setDraft(open, draft); }}
      onHint={() => undefined}
      onReveal={() => undefined}
      onBack={leaveWorkspace}
      review={null}
      interview={{ passed: problem?.passedAt !== null && problem !== undefined, onAttempt: (passed) => { attempt(open, passed); } }}
    />;
  }

  if (set) {
    const left = remainingMs(set, now);
    return <div className="chapter-main">
      <button className="text-button" onClick={onBack}><ArrowLeft size={15} />All desks</button>
      <header className="chapter-header">
        <p className="eyebrow">INTERVIEW · RUNNING</p>
        <h1>Timed set</h1>
        <p className="intro-copy">Run works as usual. Submit reports pass or fail only. Hints, reveals and explanations wait until the set ends. The set ends itself when the time runs out.</p>
      </header>
      <section className={`interview-clock ${expired ? 'is-expired' : ''}`} aria-live="off" aria-label="Time left">
        <Timer size={20} />
        <strong>{expired ? 'Time is up. Checking your drafts…' : `${mmss(left)} left`}</strong>
        <span className="muted">Limit {set.limitMinutes} min</span>
      </section>
      {message && <p role="alert" className="query-error">{message}</p>}
      <section className="practice-section" aria-labelledby="set-problems">
        <h2 id="set-problems">Problems</h2>
        <div className="practice-list">{set.problems.map((problem) => <button key={problem.id} className="practice-row" disabled={expired} onClick={() => { openWorkspace(problem.id); }}>
          <span className="practice-title">{titleOf(problem.id)}</span>
          <span className={`ticket-badge ${problem.passedAt !== null ? 'passed-badge' : ''}`}>{problem.passedAt !== null ? <><Check size={12} /> Passed in this set</> : 'Open'}</span>
          <ArrowRight size={16} />
        </button>)}</div>
      </section>
      <div className="button-row">
        <button className="primary-button" disabled={expired} onClick={finishNow}><Send size={15} />Finish set</button>
      </div>
    </div>;
  }

  if (viewing) {
    return <div className="chapter-main">
      <button className="text-button" onClick={onBack}><ArrowLeft size={15} />All desks</button>
      <header className="chapter-header">
        <p className="eyebrow">INTERVIEW · RESULTS</p>
        <h1>{viewing.expired ? 'The timer ended the set' : 'Set finished'}</h1>
        <p className="intro-copy">{viewing.problems.filter((problem) => problem.passedAt !== null).length} of {viewing.problems.length} passed. {readyLine}</p>
      </header>
      {viewing.problems.map((problem) => {
        const challenge = reserveChallenge(problem.id);
        const finalDraft = save.tickets[problem.id]?.draft ?? '';
        return <section key={problem.id} className="practice-section" aria-labelledby={`result-${problem.id}`}>
          <h2 id={`result-${problem.id}`}>{titleOf(problem.id)} <span className={`ticket-badge ${problem.passedAt !== null ? 'passed-badge' : ''}`}>{problem.passedAt !== null ? <><Check size={12} /> Passed {mmss((problem.passedAt - viewing.startedAt))} in</> : 'Not passed'}</span></h2>
          <p className="muted"><Clock3 size={13} /> {problem.failures} failed {problem.failures === 1 ? 'submission' : 'submissions'} in this set</p>
          <p className="muted"><Clock3 size={13} /> {timeLine(problem)}</p>
          <p>Your final query</p>
          <pre>{finalDraft || '(empty)'}</pre>
          {explanations[problem.id] && <div className="mistake-feedback" role="note"><strong>This looks like a known mistake</strong><p>{explanations[problem.id]}</p></div>}
          {challenge && <details><summary>Reference solution</summary><pre>{challenge.referenceSql}</pre></details>}
        </section>;
      })}
      <div className="button-row">
        <button className="primary-button" onClick={() => { startSet(false); }}><Play size={15} />Start another set</button>
      </div>
    </div>;
  }

  const history = save.interviewHistory.slice(-5).reverse();
  const comparison = estimateComparison(save.interviewHistory);
  return <div className="chapter-main">
    <button className="text-button" onClick={onBack}><ArrowLeft size={15} />All desks</button>
    <header className="chapter-header">
      <p className="eyebrow">INTERVIEW</p>
      <h1>Timed interview set</h1>
      <p className="intro-copy">Three problems against the clock. The time limit is the sum of their estimates, rounded up to a whole minute. Run works as usual; Submit reports pass or fail only. No hints, reveals or explanations until the set ends.</p>
      <p className={ready ? 'readiness-ready' : 'muted'}>{readyLine}</p>
    </header>
    <div className="button-row">
      <button className="primary-button" onClick={() => { startSet(false); }}><Play size={15} />Start a set</button>
      {import.meta.env.DEV && <button className="secondary-button" data-dev-marker="__SQL_DESK_SHORT_SET__" onClick={() => { startSet(true); }}>Short set (dev): 1 problem, 2 minutes</button>}
    </div>
    {history.length > 0 && <section className="practice-section" aria-labelledby="set-history">
      <h2 id="set-history">Recent sets</h2>
      <ul className="weak-list">{history.map((result) => <li key={result.id} className="readiness-row">
        <span>{new Date(result.startedAt).toISOString().slice(0, 10)}</span>
        <span>{result.problems.filter((problem) => problem.passedAt !== null).length} of {result.problems.length} passed{result.expired ? ' · timer ended the set' : ''}</span>
      </li>)}</ul>
    </section>}
    <section className="practice-section" aria-labelledby="estimate-compare">
      <h2 id="estimate-compare">Estimates vs your times</h2>
      <p className="muted">Medians over your finished sets. A line marked off has a median more than half away from its estimate.</p>
      {comparison.length === 0
        ? <p className="muted">No timed problems yet. Finish a set to see your times.</p>
        : <ul className="weak-list">{comparison.map((row) => <li key={row.id} className="readiness-row">
          <span>{titleOf(row.id)}</span>
          <span>Estimate {row.estimate} min · your median {row.medianMinutes.toFixed(1)} min over {row.sets} {row.sets === 1 ? 'set' : 'sets'}{isOffEstimate(row) ? ' · off' : ''}</span>
        </li>)}</ul>}
    </section>
  </div>;
}
