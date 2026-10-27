import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle, Play, Table2, XCircle } from 'lucide-react';
import type { QueryResult } from '../core/types';
import { sqlEngine } from '../engine/client';
import ResultsTable from '../components/ResultsTable';

const SqlEditor = lazy(() => import('../components/SqlEditor'));

// Free queries run through the same read-only preview path as the tickets: visible sample only, nothing graded or saved.
export default function Scratchpad({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState('SELECT id, name\nFROM customers\nORDER BY id;');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    sqlEngine.initialize().then(() => { if (!cancelled) setReady(true); }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, []);
  const run = async () => {
    setBusy(true); setMessage('');
    try { setResult(await sqlEngine.preview(text)); }
    catch (error) { setResult(null); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="chapter-main">
    <button className="text-button" onClick={onBack}><ArrowLeft size={15} />Back</button>
    <header className="chapter-header"><p className="eyebrow">SCRATCHPAD</p><h1>Free query</h1><p className="intro-copy">Read-only queries against the visible sample. Nothing here is graded or saved.</p></header>
    <section className="editor-card" aria-label="Scratchpad query"><Suspense fallback={<pre>{text}</pre>}><SqlEditor value={text} onChange={(value) => { setText(value.slice(0, 4_000)); }} onRun={() => { if (ready && !busy) void run(); }} /></Suspense>
      <div className="editor-actions"><span>PostgreSQL · Ctrl / ⌘ + Enter to run</span><button className="primary-button" disabled={!ready || busy} onClick={() => { void run(); }}>{busy ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}Run</button></div></section>
    {message && <div className="query-error" role="alert"><XCircle size={18} /><span>{message}</span></div>}
    <section className="results-card" aria-label="Scratchpad results"><div className="panel-heading"><span><Table2 size={16} />Results</span><span className="muted">{result ? `${result.rows.length} rows` : 'Run a query to see rows'}</span></div>{result && <ResultsTable result={result} />}</section>
  </div>;
}
