import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleHelp, ExternalLink, LoaderCircle, Play, XCircle } from 'lucide-react';
import type { Lesson, LessonSection } from '../core/lesson';
import type { MistakeTag } from '../core/types';
import type { Chapter } from '../data/curriculum';
import citations from '../data/citations.json';
import { sqlEngine } from '../engine/client';
import type { QueryResult } from '../core/types';
import type { LessonProgress } from '../save/progress';
import ResultsTable from '../components/ResultsTable';
import { shuffleOptions } from './model';
import type { Demonstration } from '../core/lesson';

const SqlEditor = lazy(() => import('../components/SqlEditor'));

// Each chapter's lesson lives in its own module so a chapter loads only its own text.
async function loadLesson(chapterId: number): Promise<Lesson> {
  switch (chapterId) {
    case 1: return (await import('../data/lessons/ch1')).lesson1;
    case 2: return (await import('../data/lessons/ch2')).lesson2;
    case 3: return (await import('../data/lessons/ch3')).lesson3;
    case 4: return (await import('../data/lessons/ch4')).lesson4;
    case 5: return (await import('../data/lessons/ch5')).lesson5;
    case 6: return (await import('../data/lessons/ch6')).lesson6;
    case 7: return (await import('../data/lessons/ch7')).lesson7;
    case 8: return (await import('../data/lessons/ch8')).lesson8;
    case 9: return (await import('../data/lessons/ch9')).lesson9;
    default: throw new Error(`No lesson for chapter ${chapterId}`);
  }
}

const mistakeLabel = (mistake: MistakeTag) => mistake.replaceAll('_', ' ').toLowerCase();

function DemonstrationCard({ demonstration }: { demonstration: Demonstration }) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setMessage('');
    try { await sqlEngine.initialize(); setResult(await (demonstration.explain ? sqlEngine.demonstrate(demonstration.sql) : sqlEngine.preview(demonstration.sql))); }
    catch (error) { setResult(null); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="demonstration">
    <p className="eyebrow">DEMONSTRATED BY THE ENGINE</p>
    <p>{demonstration.claim}</p>
    <pre>{demonstration.sql}</pre>
    <div className="button-row"><button className="secondary-button" disabled={busy} onClick={() => { void run(); }}>{busy ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}Run demonstration</button></div>
    {message && <div className="query-error" role="alert"><XCircle size={18} /><span>{message}</span></div>}
    {result && <div className="results-card"><ResultsTable result={result} /></div>}
  </div>;
}

function Section({ section, saved, onAnswer }: { section: LessonSection; saved: LessonProgress | undefined; onAnswer: (progress: LessonProgress) => void }) {
  const [text, setText] = useState(section.example);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<string | null>(saved?.answer ?? null);
  const [checked, setChecked] = useState(Boolean(saved?.read && saved.answer));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Options are shuffled per visit; their ids are stable, so the stored answer does not depend on the order.
  const options = useMemo(() => shuffleOptions(section.predict.options), [section.predict]);
  useEffect(() => {
    let cancelled = false;
    sqlEngine.initialize().then(() => { if (!cancelled) setReady(true); }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, []);
  const run = async (sql: string) => {
    setBusy(true); setMessage('');
    try { setResult(await sqlEngine.preview(sql)); }
    catch (error) { setResult(null); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const check = () => {
    if (!picked) return;
    setChecked(true);
    onAnswer({ read: true, answer: picked, correct: picked === section.predict.answer });
  };
  const answeredCorrectly = checked && picked === section.predict.answer;
  return <section className="lesson-section" aria-labelledby={`${section.id}-title`}>
    <h2 id={`${section.id}-title`}>{section.title}</h2>
    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    <p className="eyebrow">RUN IT · EDIT IT · THE RESULT COMES FROM POSTGRESQL</p>
    <Suspense fallback={<pre>{text}</pre>}><SqlEditor value={text} onChange={(value) => { setText(value.slice(0, 4_000)); }} onRun={() => { if (ready && !busy) void run(text); }} /></Suspense>
    <div className="button-row"><button className="secondary-button" disabled={!ready || busy} onClick={() => { void run(text); }}>{busy ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}Run example</button><button className="text-button" onClick={() => { setText(section.example); setResult(null); }}>Reset example</button></div>
    {message && <div className="query-error" role="alert"><XCircle size={18} /><span>{message}</span></div>}
    {result && <div className="results-card"><ResultsTable result={result} /></div>}
    <fieldset className="predict-card">
      <legend><CircleHelp size={16} /> Predict, then check: {section.predict.question}</legend>
      {options.map((option) => <label key={option.id} className="predict-option"><input type="radio" name={`${section.id}-predict`} value={option.id} checked={picked === option.id} onChange={() => { setPicked(option.id); setChecked(false); }} /><span>{option.text}</span></label>)}
      <button className="secondary-button" disabled={!picked} onClick={check}>Check my prediction</button>
      {checked && <div className={`predict-result ${answeredCorrectly ? 'predict-right' : 'predict-wrong'}`} role="status">{answeredCorrectly ? <Check size={16} /> : <XCircle size={16} />}<p>{answeredCorrectly ? 'Right. ' : 'Not quite. '}{section.predict.explanation}</p></div>}
    </fieldset>
    <div className="common-mistakes"><h3>Common mistakes</h3><ul>{section.commonMistakes.map((mistake) => <li key={mistake.text}><span className="mistake-tag">{mistakeLabel(mistake.mistake)}</span>{mistake.text}</li>)}</ul></div>
    {section.demonstrations?.map((demonstration) => <DemonstrationCard key={demonstration.sql} demonstration={demonstration} />)}
    <div className="source-links">{section.citations.map((id) => {
      const citation = citations.find((entry) => entry.id === id);
      if (!citation) return null;
      return <figure key={id} className="citation"><blockquote>“{citation.quote}”</blockquote><figcaption><a href={citation.url} target="_blank" rel="noreferrer">PostgreSQL 18 documentation<ExternalLink size={12} /></a></figcaption></figure>;
    })}</div>
  </section>;
}

export default function LessonView({ chapter, lessonProgress, onAnswer, onBack, onPractice }: {
  chapter: Chapter; lessonProgress: Record<string, LessonProgress>; onAnswer: (sectionId: string, progress: LessonProgress) => void; onBack: () => void; onPractice: () => void;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLesson(null); setError('');
    loadLesson(chapter.id).then((loaded) => { if (!cancelled) setLesson(loaded); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [chapter.id]);
  return <div className="chapter-main lesson-main">
    <button className="text-button" onClick={onBack}><ArrowLeft size={15} />Chapter {chapter.id}</button>
    <header className="chapter-header"><p className="eyebrow">LESSON · CHAPTER {chapter.id}</p><h1>{chapter.title}</h1><p className="intro-copy">Read a section, run its example, predict the result, then check.</p></header>
    {error && <p role="alert" className="save-warning">The lesson could not load: {error}</p>}
    {!lesson && !error && <div className="loading-card" role="status"><LoaderCircle className="spin" /> Loading lesson…</div>}
    {lesson?.sections.map((section) => <Section key={section.id} section={section} saved={lessonProgress[section.id]} onAnswer={(progress) => { onAnswer(section.id, progress); }} />)}
    {chapter.dialectNotes.length > 0 && <section className="lesson-section" aria-labelledby="dialect-title"><h2 id="dialect-title">Dialect notes</h2><ul>{chapter.dialectNotes.map((note) => <li key={note.note}><strong>{note.dialect}:</strong> {note.note} <a href={note.source} target="_blank" rel="noreferrer">Source<ExternalLink size={12} /></a></li>)}</ul></section>}
    <div className="button-row"><button className="primary-button" onClick={onPractice}>Go to practice<ArrowRight size={15} /></button></div>
  </div>;
}
