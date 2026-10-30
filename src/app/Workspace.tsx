import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Database, ExternalLink, Eye, KeyRound, LoaderCircle, Play, RefreshCw, Send, Table2, Terminal, XCircle } from 'lucide-react';
import type { Challenge, GradeReport, QueryResult } from '../core/types';
import { curriculum } from '../data/curriculum';
import { reviewSampleFor } from '../data/datasets';
import { schema } from '../data/seed';
import { sqlEngine } from '../engine/client';
import type { EngineInfo, StatePreview } from '../engine/protocol';
import StateSample from './StateSample';
import { BADGES, HINT_COST, REVEAL_XP, type GradeResult } from '../game/rules';
import type { TicketProgress } from '../save/progress';
import SqlEditor, { type SqlEditorHandle } from '../components/SqlEditor';
import ResultsTable, { cellText } from '../components/ResultsTable';

interface Props {
  challenge: Challenge; code: string; partLabel: string | undefined; backLabel: string; progress: TicketProgress;
  setDraft: (draft: string) => void;
  // Grades the submission against the save. tag is the mistake the matched wrong variant models, or null.
  // hinted says whether this review attempt has a hint or an earlier failure in it. Only a review uses it.
  grade?: (passed: boolean, sql: string, tag: string | null, hinted: boolean) => GradeResult;
  onHint: () => void; onReveal: () => void; onBack: () => void;
  // Set when the ticket is opened for review: the re-solve runs on this review sample. Null for a learning ticket.
  review: { sampleId: string } | null;
  // Set when the ticket is one problem of a timed interview set. Submit then reports pass or fail only, and the set owns the result.
  interview?: { passed: boolean; onAttempt: (passed: boolean) => void };
}

const chapterTitle = (chapterId: number): string => (curriculum.find((chapter) => chapter.id === chapterId)?.title ?? '').toUpperCase();
const typeNames: Record<number, string> = { 23: 'integer', 25: 'text', 1184: 'timestamptz' };
const badgeTitle = (id: string): string => BADGES.find((badge) => badge.id === id)?.title ?? id;

export default function Workspace({ challenge, code, partLabel, backLabel, progress, setDraft, grade, onHint, onReveal, onBack, review, interview }: Props) {
  const editor = useRef<SqlEditorHandle>(null);
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [engineError, setEngineError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [statePreview, setStatePreview] = useState<StatePreview | null>(null);
  const [report, setReport] = useState<GradeReport | null>(null);
  const [outcome, setOutcome] = useState<GradeResult | null>(null);
  const [message, setMessage] = useState('');
  const [showLesson, setShowLesson] = useState(false);
  const [showSchema, setShowSchema] = useState(true);
  const [table, setTable] = useState('shipments');
  const [tableRows, setTableRows] = useState<QueryResult | null>(null);
  const [tableError, setTableError] = useState('');
  const [reload, setReload] = useState(0);
  // A review attempt is assisted once it has a hint or a failure. A pass ends the attempt.
  const [assisted, setAssisted] = useState(false);
  const reviewSampleId = review?.sampleId;
  useEffect(() => {
    let cancelled = false;
    setEngineError('');
    sqlEngine.initialize().then((info) => { if (!cancelled) setEngineInfo(info); }).catch((error: unknown) => { if (!cancelled) setEngineError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [reload]);
  useEffect(() => {
    if (!engineInfo || !showSchema) return;
    let cancelled = false;
    setTableRows(null);
    setTableError('');
    sqlEngine.table(table).then((rows) => { if (!cancelled) setTableRows(rows); }).catch((error: unknown) => { if (!cancelled) setTableError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [engineInfo, table, showSchema]);
  const preview = useCallback(async (sql: string) => {
    setBusy(true); setMessage(''); setReport(null); setOutcome(null); setResult(null); setStatePreview(null);
    try {
      // Write tickets show database state after the learner's statements; read tickets show their query rows.
      if (challenge.checks) { setStatePreview(await sqlEngine.previewState(challenge.id, sql, reviewSampleId)); setResult(null); }
      else { setResult(await sqlEngine.preview(sql, reviewSampleId)); }
    }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }, [challenge.id, challenge.checks, reviewSampleId]);
  const submit = async () => {
    setBusy(true); setMessage('');
    try {
      if (interview) {
        const graded = await sqlEngine.grade(challenge.id, progress.draft);
        setReport(graded.report); setStatePreview(null); setResult(graded.preview);
        interview.onAttempt(graded.report.passed);
        return;
      }
      const graded = await sqlEngine.grade(challenge.id, progress.draft, reviewSampleId);
      const passed = graded.report.passed;
      setReport(graded.report); setStatePreview(null); setResult(graded.preview);
      setOutcome(grade?.(passed, progress.draft, graded.report.mistake?.mistake ?? null, assisted) ?? null);
      if (review) setAssisted(!passed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setOutcome(grade?.(false, progress.draft, null, assisted) ?? null);
      if (review) setAssisted(true);
    } finally { setBusy(false); }
  };
  const hintTaken = () => {
    if (review) setAssisted(true);
    onHint();
  };
  const selectedTable = schema.find((item) => item.name === table)!;
  const available = Boolean(engineInfo) && !busy;
  const boss = challenge.role === 'boss';
  const hintLabel = (tier: number) => `Reveal hint ${tier} · ${progress.passed ? 'no XP cost' : `−${HINT_COST} XP`}`;
  const revealLabel = boss ? 'Show solution · no mastery credit' : `Show solution · ${REVEAL_XP} XP after a pass`;
  const copyOfReveal = outcome?.copyOfReveal === true;
  return <>
    <div className="workspace-toolbar"><button className="text-button" onClick={onBack}><ArrowLeft size={15} />{backLabel}</button><span className="engine-label"><span className={`status-dot ${engineInfo ? '' : 'pending-dot'}`} />{engineInfo ? 'PostgreSQL · ready' : 'Opening SQL workspace'}</span></div>
    {review && <p className="review-banner" role="note"><RefreshCw size={15} /><span><strong>Review.</strong> This re-solve runs on {reviewSampleFor(review.sampleId)?.label ?? 'a review sample'}, not the visible sample. A first try counts in full toward readiness, a hint or a pass after a failure counts half, and a reveal or a failure counts nothing.</span></p>}
    <section className="ticket-brief" aria-labelledby="ticket-title"><div className="brief-title"><span className="eyebrow">{code} / CHAPTER {challenge.chapterId} · {chapterTitle(challenge.chapterId)}{partLabel ? ` · ${partLabel.toUpperCase()}` : ''}</span>{(interview ? interview.passed : progress.passed) && <span className="ticket-badge passed-badge"><Check size={13} />Passed</span>}</div><h1 id="ticket-title">{challenge.title}</h1><div className="brief-from"><span className="colleague-avatar small-avatar">{challenge.colleague.split(' ').map((part) => part[0]).join('')}</span><span>From <strong>{challenge.colleague}</strong> · {challenge.colleagueRole}</span></div><p>{challenge.instructions}</p><div className="column-contract"><strong>Expected columns</strong>{challenge.columns.map((column) => <span key={column.name}><code>{column.name}</code><small>{typeNames[column.type] ?? column.type}</small></span>)}</div></section>
    {challenge.lesson && <div className="lesson-card"><button className="lesson-toggle" onClick={() => { setShowLesson(!showLesson); }} aria-expanded={showLesson} aria-controls="briefing"><BookOpen size={18} /><span>Before you start: a quick field guide</span>{showLesson ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{showLesson && <div id="briefing" className="lesson-body"><p>{challenge.lesson}</p><p className="eyebrow">WORKED EXAMPLE · EDIT IT, TRY IT</p><pre>{(challenge.exampleSql ?? '')}</pre><div className="button-row"><button className="secondary-button" disabled={!available} onClick={() => { void preview((challenge.exampleSql ?? '')); }}><Play size={14} />Run example</button><button className="text-button" onClick={() => { setDraft(challenge.exampleSql ?? ''); }}>Edit example in workspace<ArrowRight size={14} /></button></div>{challenge.guidedSql && <><p>Guided practice: replace the blanks, run it, then return to the ticket.</p><pre>{challenge.guidedSql}</pre><button className="text-button" onClick={() => { setDraft(challenge.guidedSql!); }}>Load guided practice<ArrowRight size={14} /></button></>}<div className="source-links">{challenge.docs.map((doc) => <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer">{doc.label}<ExternalLink size={12} /></a>)}</div></div>}</div>}
    {!engineInfo && <div className="engine-loading" role={engineError ? 'alert' : 'status'}>{engineError ? <><XCircle size={20} /><div><strong>Workspace couldn’t open</strong><p>{engineError}</p><button className="secondary-button" onClick={() => { setReload((value) => value + 1); }}>Try again</button></div></> : <><LoaderCircle className="spin" size={22} /><div><strong>Getting your SQL workspace ready…</strong><p>The first load takes a moment. Your query draft is safe.</p></div></>}</div>}
    <div className={`work-grid ${showSchema ? '' : 'schema-hidden'}`}>
      <div className="query-column">
        <section className="editor-card" aria-label="Query workspace"><div className="panel-heading"><span><Terminal size={17} />Your query <span className="file-label">ticket.sql</span></span><button className="text-button" onClick={() => { setShowSchema(!showSchema); }} aria-expanded={showSchema} aria-controls="schema-panel"><Table2 size={15} />{showSchema ? 'Hide schema' : 'Show schema'}</button></div>
          <SqlEditor ref={editor} value={progress.draft} onChange={(draft) => { setDraft(draft.slice(0, 20_000)); }} onRun={() => { if (available) void preview(progress.draft); }} />
          <div className="keyword-bar" aria-label="SQL keywords">{['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'IS NULL'].map((keyword) => <button key={keyword} type="button" aria-label={`Insert ${keyword}`} onClick={() => { editor.current?.insert(keyword); }}>{keyword}</button>)}</div>
          <div className="editor-actions"><span id="query-help">PostgreSQL · Ctrl / ⌘ + Enter to run<br /><small>Sample run: 3.5 s / 1,000 rows · submission: 6 s total</small></span><div className="button-row"><button className="secondary-button" disabled={!available} onClick={() => { void preview(progress.draft); }}><Play size={14} />Run sample</button><button className="primary-button" disabled={!available} onClick={() => { void submit(); }}>{busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}Submit query</button></div></div>
        </section>
        {message && <div className="query-error" role="alert"><XCircle size={18} /><span>{message}</span></div>}
        {report && interview && <section className={`grade-card ${report.passed ? 'grade-passed' : 'grade-failed'}`} aria-label="Submission feedback"><div className="grade-title" role="status">{report.passed ? <CheckCircle2 size={22} /> : <CircleHelp size={22} />}<div><h2>{report.passed ? 'Passed in this set.' : 'Not passed yet.'}</h2><p>Results, with the reference solution and the explanation for any mistake, show when the set ends.</p></div></div></section>}
        {report && !interview && <section className={`grade-card ${report.passed && !copyOfReveal ? 'grade-passed' : 'grade-failed'}`} aria-label="Submission feedback"><div className="grade-title" role="status">{report.passed && !copyOfReveal ? <CheckCircle2 size={22} /> : <CircleHelp size={22} />}<div><h2>{copyOfReveal ? 'Matches the revealed solution, so it does not count.' : report.passed ? 'Ticket passed. Nice work.' : 'Not quite there. Keep investigating.'}</h2><p>{copyOfReveal ? 'A boss part you revealed has to be passed with your own query before it counts toward mastery.' : report.passed ? `Your query matched on all ${report.outcomes.length} datasets. ${outcome?.counted ? `${outcome.xp} XP earned on this pass.` : 'No new XP on this pass.'}` : report.error ?? 'Check the feedback below, then try another query.'}</p>{outcome?.badges.map((id) => <p key={id}><strong>New badge:</strong> {badgeTitle(id)}</p>)}</div><span className="grade-time"><Clock3 size={13} />{Math.round(report.elapsedMs)} ms</span></div>{report.mistake && <div className="mistake-feedback" role="note"><strong>This looks like a known mistake</strong><p>{report.mistake.explanation}</p></div>}{report.outcomes.map((outcomeRow) => <details key={outcomeRow.id} className="dataset-feedback"><summary><span>{outcomeRow.passed ? <Check size={15} /> : <XCircle size={15} />}{outcomeRow.label}{outcomeRow.hidden && <small>Hidden checks</small>}</span><strong>{outcomeRow.passed ? 'Passed' : 'Needs work'}</strong></summary><p>{outcomeRow.diff.message}</p>{outcomeRow.diff.missing.length > 0 && <div><strong>Missing rows · small diff</strong><pre>{outcomeRow.diff.missing.map((row) => row.map(cellText).join(' | ')).join('\n')}</pre></div>}{outcomeRow.diff.extra.length > 0 && <div><strong>Extra or misplaced rows · small diff</strong><pre>{outcomeRow.diff.extra.map((row) => row.map(cellText).join(' | ')).join('\n')}</pre></div>}</details>)}</section>}
        <section className="results-card" aria-label="Sample output"><div className="panel-heading"><span><Database size={16} />{statePreview ? 'Sample state' : 'Sample results'}</span><span className="muted">{statePreview ? 'After your statements' : result ? `${result.rows.length} rows` : 'Run your query to inspect the data'}</span></div>{statePreview ? <StateSample state={statePreview} /> : result ? <ResultsTable result={result} /> : <div className="results-empty"><Table2 size={27} strokeWidth={1.3} /><p>Your results will arrive here.</p><small>Run against the visible sample first. Submit to check all three datasets.</small></div>}</section>
        {!interview && <section className="help-card"><div className="help-heading"><CircleHelp size={18} /><div><h2>A little help with the heavy lifting</h2><p>Hints cost {HINT_COST} XP each before you pass. They’re always available, even at zero XP.</p></div></div>{challenge.hints.slice(0, progress.hintTier).map((hint, index) => <div key={hint} className="hint"><span>HINT {index + 1}</span><pre>{hint}</pre></div>)}<div className="button-row"><button className="secondary-button" disabled={progress.hintTier >= 3} onClick={hintTaken}>{progress.hintTier >= 3 ? 'All three hints revealed' : hintLabel(progress.hintTier + 1)}</button><button className="text-button" onClick={onReveal}><Eye size={14} />{revealLabel}</button></div>{progress.failures >= 3 && !progress.solutionRevealed && <p className="table-caption">Three tries in: the solution is available whenever you want it.</p>}{progress.solutionRevealed && <div className="solution"><p><strong>Reference solution</strong> · {boss ? 'a revealed boss part does not count. Pass it again with your own query.' : `a pass after a reveal earns ${REVEAL_XP} XP.`}</p><pre>{challenge.referenceSql}</pre><button className="text-button" onClick={() => { setDraft(challenge.referenceSql); }}>Load solution into editor<ArrowRight size={14} /></button></div>}</section>}
      </div>
      {showSchema && <aside className="schema-panel" id="schema-panel" aria-label="Schema browser"><div className="panel-heading"><span><Table2 size={17} />Schema explorer</span><span className="muted">{schema.length} tables</span></div><div className="schema-body"><label htmlFor="table-select">Explore a table</label><select id="table-select" value={table} onChange={(event) => { setTable(event.target.value); }}>{schema.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><p>{selectedTable.description}</p><div className="schema-columns">{selectedTable.columns.map((column) => <div key={column.name}><span>{column.primaryKey ? <KeyRound size={12} /> : <span className="column-dot" />}<code>{column.name}</code></span><small>{column.type}{column.nullable ? ' · NULL' : ''}</small></div>)}</div><h3>Sample rows</h3><p className="table-caption">First five rows from the visible dataset.</p>{tableError ? <p role="alert">{tableError}</p> : tableRows ? <ResultsTable result={tableRows} label={`${table} sample rows`} maxRows={5} /> : <p role="status" className="muted">Loading sample rows…</p>}<div className="schema-note"><Database size={15} /><p>Tables stay consistent between runs. Query changes roll back automatically.</p></div></div></aside>}
    </div>
  </>;
}
