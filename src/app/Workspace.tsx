import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Database, ExternalLink, Eye, KeyRound, LoaderCircle, Play, Send, Table2, Terminal, XCircle } from 'lucide-react';
import type { Challenge, GradeReport, QueryResult } from '../core/types';
import { schema } from '../data';
import { sqlEngine } from '../engine/client';
import type { EngineInfo, StatePreview } from '../engine/protocol';
import StateSample from './StateSample';
import { recordGrade, rewardFor, useHint, type TicketProgress } from '../save/progress';
import SqlEditor, { type SqlEditorHandle } from '../components/SqlEditor';
import ResultsTable, { cellText } from '../components/ResultsTable';
interface Props { challenge: Challenge; code: string; partLabel: string | undefined; backLabel: string; progress: TicketProgress; update: (fn: (value: TicketProgress) => TicketProgress) => void; onBack: () => void }
const typeNames: Record<number, string> = { 23: 'integer', 25: 'text', 1184: 'timestamptz' };
export default function Workspace({ challenge, code, partLabel, backLabel, progress, update, onBack }: Props) {
  const editor = useRef<SqlEditorHandle>(null);
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [engineError, setEngineError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [statePreview, setStatePreview] = useState<StatePreview | null>(null);
  const [report, setReport] = useState<GradeReport | null>(null);
  const [message, setMessage] = useState('');
  const [showLesson, setShowLesson] = useState(false);
  const [showSchema, setShowSchema] = useState(true);
  const [table, setTable] = useState('shipments');
  const [tableRows, setTableRows] = useState<QueryResult | null>(null);
  const [tableError, setTableError] = useState('');
  const [reload, setReload] = useState(0);
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
    setBusy(true); setMessage(''); setReport(null);
    try {
      // Write tickets show database state after the learner's statements; read tickets show their query rows.
      if (challenge.checks) { setStatePreview(await sqlEngine.previewState(challenge.id, sql)); setResult(null); }
      else { setResult(await sqlEngine.preview(sql)); }
    }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }, [challenge.id, challenge.checks]);
  const submit = async () => {
    setBusy(true); setMessage('');
    try {
      const graded = await sqlEngine.grade(challenge.id, progress.draft);
      setReport(graded.report); setStatePreview(null); setResult(graded.preview);
      update((previous) => recordGrade(previous, graded.report.passed));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      update((previous) => recordGrade(previous, false));
    } finally { setBusy(false); }
  };
  const selectedTable = schema.find((item) => item.name === table)!;
  const available = Boolean(engineInfo) && !busy;
  return <>
    <div className="workspace-toolbar"><button className="text-button" onClick={onBack}><ArrowLeft size={15} />{backLabel}</button><span className="engine-label"><span className={`status-dot ${engineInfo ? '' : 'pending-dot'}`} />{engineInfo ? 'PostgreSQL · ready' : 'Opening SQL workspace'}</span></div>
    <section className="ticket-brief" aria-labelledby="ticket-title"><div className="brief-title"><span className="eyebrow">{code} / {challenge.kind === 'fix' ? 'DEBUG A QUERY' : challenge.kind === 'window' ? 'WINDOW FUNCTIONS' : challenge.kind === 'guided' ? 'GUIDED PRACTICE' : 'INDEPENDENT TICKET'}{partLabel ? ` · ${partLabel.toUpperCase()}` : ''}</span>{progress.passed && <span className="ticket-badge passed-badge"><Check size={13} />Passed</span>}</div><h1 id="ticket-title">{challenge.title}</h1><div className="brief-from"><span className="colleague-avatar small-avatar">{challenge.colleague.split(' ').map((part) => part[0]).join('')}</span><span>From <strong>{challenge.colleague}</strong> · {challenge.colleagueRole}</span></div><p>{challenge.instructions}</p><div className="column-contract"><strong>Expected columns</strong>{challenge.columns.map((column) => <span key={column.name}><code>{column.name}</code><small>{typeNames[column.type] ?? column.type}</small></span>)}</div></section>
    {challenge.lesson && <div className="lesson-card"><button className="lesson-toggle" onClick={() => { setShowLesson(!showLesson); }} aria-expanded={showLesson} aria-controls="briefing"><BookOpen size={18} /><span>Before you start: a quick field guide</span>{showLesson ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{showLesson && <div id="briefing" className="lesson-body"><p>{challenge.lesson}</p><p className="eyebrow">WORKED EXAMPLE · EDIT IT, TRY IT</p><pre>{(challenge.exampleSql ?? '')}</pre><div className="button-row"><button className="secondary-button" disabled={!available} onClick={() => { void preview((challenge.exampleSql ?? '')); }}><Play size={14} />Run example</button><button className="text-button" onClick={() => { update((previous) => ({ ...previous, draft: (challenge.exampleSql ?? '') })); }}>Edit example in workspace<ArrowRight size={14} /></button></div>{challenge.guidedSql && <><p>Guided practice: replace the blanks, run it, then return to the ticket.</p><pre>{challenge.guidedSql}</pre><button className="text-button" onClick={() => { update((previous) => ({ ...previous, draft: challenge.guidedSql! })); }}>Load guided practice<ArrowRight size={14} /></button></>}<div className="source-links">{challenge.docs.map((doc) => <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer">{doc.label}<ExternalLink size={12} /></a>)}</div></div>}</div>}
    {!engineInfo && <div className="engine-loading" role={engineError ? 'alert' : 'status'}>{engineError ? <><XCircle size={20} /><div><strong>Workspace couldn’t open</strong><p>{engineError}</p><button className="secondary-button" onClick={() => { setReload((value) => value + 1); }}>Try again</button></div></> : <><LoaderCircle className="spin" size={22} /><div><strong>Getting your SQL workspace ready…</strong><p>The first load takes a moment. Your query draft is safe.</p></div></>}</div>}
    <div className={`work-grid ${showSchema ? '' : 'schema-hidden'}`}>
      <div className="query-column">
        <section className="editor-card" aria-label="Query workspace"><div className="panel-heading"><span><Terminal size={17} />Your query <span className="file-label">ticket.sql</span></span><button className="text-button" onClick={() => { setShowSchema(!showSchema); }} aria-expanded={showSchema} aria-controls="schema-panel"><Table2 size={15} />{showSchema ? 'Hide schema' : 'Show schema'}</button></div>
          <SqlEditor ref={editor} value={progress.draft} onChange={(draft) => { update((previous) => ({ ...previous, draft: draft.slice(0, 20_000) })); }} onRun={() => { if (available) void preview(progress.draft); }} />
          <div className="keyword-bar" aria-label="SQL keywords">{['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'IS NULL'].map((keyword) => <button key={keyword} type="button" aria-label={`Insert ${keyword}`} onClick={() => { editor.current?.insert(keyword); }}>{keyword}</button>)}</div>
          <div className="editor-actions"><span id="query-help">PostgreSQL · Ctrl / ⌘ + Enter to run<br /><small>Sample run: 3.5 s / 1,000 rows · submission: 6 s total</small></span><div className="button-row"><button className="secondary-button" disabled={!available} onClick={() => { void preview(progress.draft); }}><Play size={14} />Run sample</button><button className="primary-button" disabled={!available} onClick={() => { void submit(); }}>{busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}Submit query</button></div></div>
        </section>
        {message && <div className="query-error" role="alert"><XCircle size={18} /><span>{message}</span></div>}
        {report && <section className={`grade-card ${report.passed ? 'grade-passed' : 'grade-failed'}`} aria-label="Submission feedback"><div className="grade-title" role="status">{report.passed ? <CheckCircle2 size={22} /> : <CircleHelp size={22} />}<div><h2>{report.passed ? 'Ticket passed. Nice work.' : 'Not quite there. Keep investigating.'}</h2><p>{report.passed ? `Your query matched on all {report.outcomes.length} datasets. ${rewardFor(progress)} XP available for this ticket.` : report.error ?? 'Check the feedback below, then try another query.'}</p></div><span className="grade-time"><Clock3 size={13} />{Math.round(report.elapsedMs)} ms</span></div>{report.mistake && <div className="mistake-feedback" role="note"><strong>This looks like a known mistake</strong><p>{report.mistake.explanation}</p></div>}{report.outcomes.map((outcome) => <details key={outcome.id} className="dataset-feedback"><summary><span>{outcome.passed ? <Check size={15} /> : <XCircle size={15} />}{outcome.label}{outcome.hidden && <small>Hidden checks</small>}</span><strong>{outcome.passed ? 'Passed' : 'Needs work'}</strong></summary><p>{outcome.diff.message}</p>{outcome.diff.missing.length > 0 && <div><strong>Missing rows · small diff</strong><pre>{outcome.diff.missing.map((row) => row.map(cellText).join(' | ')).join('\n')}</pre></div>}{outcome.diff.extra.length > 0 && <div><strong>Extra or misplaced rows · small diff</strong><pre>{outcome.diff.extra.map((row) => row.map(cellText).join(' | ')).join('\n')}</pre></div>}</details>)}</section>}
        <section className="results-card" aria-label="Sample output"><div className="panel-heading"><span><Database size={16} />{statePreview ? 'Sample state' : 'Sample results'}</span><span className="muted">{statePreview ? 'After your statements' : result ? `${result.rows.length} rows` : 'Run your query to inspect the data'}</span></div>{statePreview ? <StateSample state={statePreview} /> : result ? <ResultsTable result={result} /> : <div className="results-empty"><Table2 size={27} strokeWidth={1.3} /><p>Your results will arrive here.</p><small>Run against the visible sample first. Submit to check all three datasets.</small></div>}</section>
        <section className="help-card"><div className="help-heading"><CircleHelp size={18} /><div><h2>A little help with the heavy lifting</h2><p>Hints cost 10 XP each. They’re always available, even at zero XP.</p></div></div>{challenge.hints.slice(0, progress.hintTier).map((hint, index) => <div key={hint} className="hint"><span>HINT {index + 1}</span><pre>{hint}</pre></div>)}<div className="button-row"><button className="secondary-button" disabled={progress.hintTier >= 3} onClick={() => { update(useHint); }}>{progress.hintTier >= 3 ? 'All three hints revealed' : `Reveal hint ${progress.hintTier + 1} · −10 XP`}</button><button className="text-button" onClick={() => { update((previous) => ({ ...previous, solutionRevealed: true })); }}><Eye size={14} />Show solution · reduced XP</button></div>{progress.failures >= 3 && !progress.solutionRevealed && <p className="table-caption">Three tries in: the solution is available whenever you want it.</p>}{progress.solutionRevealed && <div className="solution"><p><strong>Reference solution</strong> · solving after reveal earns at most 25 XP before hint costs.</p><pre>{challenge.referenceSql}</pre><button className="text-button" onClick={() => { update((previous) => ({ ...previous, draft: challenge.referenceSql })); }}>Load solution into editor<ArrowRight size={14} /></button></div>}</section>
      </div>
      {showSchema && <aside className="schema-panel" id="schema-panel" aria-label="Schema browser"><div className="panel-heading"><span><Table2 size={17} />Schema explorer</span><span className="muted">8 tables</span></div><div className="schema-body"><label htmlFor="table-select">Explore a table</label><select id="table-select" value={table} onChange={(event) => { setTable(event.target.value); }}>{schema.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><p>{selectedTable.description}</p><div className="schema-columns">{selectedTable.columns.map((column) => <div key={column.name}><span>{column.primaryKey ? <KeyRound size={12} /> : <span className="column-dot" />}<code>{column.name}</code></span><small>{column.type}{column.nullable ? ' · NULL' : ''}</small></div>)}</div><h3>Sample rows</h3><p className="table-caption">First five rows from the visible dataset.</p>{tableError ? <p role="alert">{tableError}</p> : tableRows ? <ResultsTable result={tableRows} label={`${table} sample rows`} maxRows={5} /> : <p role="status" className="muted">Loading sample rows…</p>}<div className="schema-note"><Database size={15} /><p>Tables stay consistent between runs. Query changes roll back automatically.</p></div></div></aside>}
    </div>
  </>;
}
