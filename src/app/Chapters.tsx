import { ArrowRight, Check, Database, Lock, Sparkles, Table2, Trophy } from 'lucide-react';
import type { ItemMeta } from '../data/itemIndex';
import type { Chapter } from '../data/curriculum';
import type { SaveV2 } from '../save/progress';
import { bossPartsOf, bossPassed, isPassed, itemsForChapter, partLabel, summarizeChapter } from './model';

export const lessonSectionIds = (chapterId: number): readonly string[] => [1, 2, 3].map((index) => `c${chapterId}-s${index}`);

export function HomeView({ chapters, items, save, onChapter, onScratch, onItem }: {
  chapters: readonly Chapter[]; items: readonly ItemMeta[]; save: SaveV2; onChapter: (id: number) => void; onScratch: () => void; onItem: (item: ItemMeta) => void;
}) {
  const showcase = items.find((item) => item.id === 'latest-event');
  const totalPassed = chapters.reduce((sum, chapter) => sum + summarizeChapter(items, save, chapter.id, lessonSectionIds(chapter.id)).passed, 0);
  const xp = Object.values(save.tickets).reduce((sum, ticket) => sum + ticket.xp, 0);
  return <>
    <div className="board-intro"><div><p className="eyebrow"><span className="status-dot" /> DISPATCH IS OPEN</p><h1>Your first week.<br /><span>Chapters 1 to 9.</span></h1><p className="intro-copy">Each chapter has a short lesson with an editable example, guided practice, independent tickets, and a boss ticket. Lessons run on the visible sample, and hints are always available.</p></div><div className="desk-illustration" aria-hidden="true"><div className="illustration-orbit orbit-a" /><div className="illustration-orbit orbit-b" /><div className="parcel parcel-front"><Database size={44} strokeWidth={1.2} /><span>HANDLE WITH SQL</span></div></div></div>
    <div className="section-heading"><div><p className="eyebrow">CURRICULUM</p><h2>Pick a chapter</h2></div><span className="section-meta">{totalPassed} tickets passed · {xp} XP</span></div>
    <div className="chapter-grid">{chapters.map((chapter) => {
      const summary = summarizeChapter(items, save, chapter.id, lessonSectionIds(chapter.id));
      return <article className="chapter-card" key={chapter.id}>
        <span className="ticket-code">CHAPTER {chapter.id}</span>
        <h3>{chapter.title}</h3>
        <p>{summary.passed} of {summary.graded} tickets passed · lesson {summary.lessonsDone} of {summary.lessonCount}</p>
        <div className="shift-progress" role="progressbar" aria-label={`Chapter ${chapter.id} tickets passed`} aria-valuenow={summary.passed} aria-valuemin={0} aria-valuemax={summary.graded}><span style={{ width: `${summary.graded ? summary.passed / summary.graded * 100 : 0}%` }} /></div>
        <span className={`ticket-badge ${summary.bossPassed ? 'passed-badge' : ''}`}>{summary.bossPassed ? <><Trophy size={12} /> Boss passed</> : 'Boss ticket open'}</span>
        <button className="ticket-open" onClick={() => { onChapter(chapter.id); }}>Open chapter {chapter.id}<ArrowRight size={17} /></button>
      </article>;
    })}</div>
    <div className="section-heading"><div><p className="eyebrow">TOOLS</p><h2>Other desk tools</h2></div></div>
    <div className="chapter-grid">
      <article className="chapter-card"><span className="ticket-code">SCRATCHPAD</span><h3>Free query</h3><p>Run any read-only query against the visible sample. Nothing is graded, and nothing is saved.</p><button className="ticket-open" onClick={onScratch}><Table2 size={16} />Open scratchpad<ArrowRight size={17} /></button></article>
      {showcase && <article className="chapter-card"><span className="ticket-code">PREVIEW · CHAPTER 8</span><h3>{showcase.title}</h3><p>{showcase.summary}</p><button className="ticket-open" onClick={() => { onItem(showcase); }}>Open preview ticket<ArrowRight size={17} /></button></article>}
    </div>
    <div className="board-footer"><span><Sparkles size={15} />Progress stays in this browser</span><span><Lock size={15} />Chapters 7 to 13 come in later steps</span></div>
  </>;
}

export function ChapterView({ chapter, items, save, onLesson, onItem, onScratch, onBack }: {
  chapter: Chapter; items: readonly ItemMeta[]; save: SaveV2; onLesson: () => void; onItem: (item: ItemMeta) => void; onScratch: () => void; onBack: () => void;
}) {
  const summary = summarizeChapter(items, save, chapter.id, lessonSectionIds(chapter.id));
  const chapterItems = itemsForChapter(items, chapter.id);
  const guided = chapterItems.filter((item) => item.role === 'guided');
  const independent = chapterItems.filter((item) => item.role === 'independent' || item.role === 'sample');
  const bossGroups = [...new Set(chapterItems.map((item) => item.bossGroup).filter((group): group is string => Boolean(group)))];
  const row = (item: ItemMeta) => <button key={item.id} className="practice-row" onClick={() => { onItem(item); }}>
    <span className="practice-title">{item.title}</span>
    <span className={`ticket-badge ${isPassed(save, item.id) ? 'passed-badge' : ''}`}>{isPassed(save, item.id) ? <><Check size={12} /> Passed</> : save.tickets[item.id]?.draft ? 'In progress' : 'Open'}</span>
    <ArrowRight size={16} />
  </button>;
  return <div className="chapter-main">
    <button className="text-button" onClick={onBack}>All chapters</button>
    <header className="chapter-header"><p className="eyebrow">CHAPTER {chapter.id}</p><h1>{chapter.title}</h1><p className="intro-copy">{summary.passed} of {summary.graded} tickets passed. Mastery needs the boss ticket.</p>
      <ul className="objective-list">{chapter.objectives.map((objective) => <li key={objective.id}>{objective.title}</li>)}</ul>
    </header>
    <section className="practice-section" aria-labelledby={`lesson-${chapter.id}`}><h2 id={`lesson-${chapter.id}`}>Lesson</h2><p>{summary.lessonsDone} of {summary.lessonCount} predictions answered correctly.</p><button className="primary-button" onClick={onLesson}><Table2 size={15} />{summary.lessonsDone === summary.lessonCount ? 'Review the lesson' : 'Open the lesson'}</button></section>
    <section className="practice-section" aria-labelledby={`guided-${chapter.id}`}><h2 id={`guided-${chapter.id}`}>Guided practice</h2><p>Fill the blanks, run the query, then submit.</p><div className="practice-list">{guided.map(row)}</div></section>
    <section className="practice-section" aria-labelledby={`independent-${chapter.id}`}><h2 id={`independent-${chapter.id}`}>Independent tickets</h2><div className="practice-list">{independent.map(row)}</div></section>
    {bossGroups.map((group) => {
      const parts = bossPartsOf(items, group);
      const passed = bossPassed(items, save, group);
      return <section className="practice-section boss-section" key={group} aria-labelledby={`boss-${group}`}><h2 id={`boss-${group}`}>Boss ticket <span className={`ticket-badge ${passed ? 'passed-badge' : ''}`}>{passed ? <><Trophy size={12} /> Boss passed</> : `${parts.filter((part) => isPassed(save, part.id)).length} of ${parts.length} parts`}</span></h2><p>Every part must pass before the boss counts.</p><div className="practice-list">{parts.map((part) => <button key={part.id} className="practice-row" onClick={() => { onItem(part); }}><span className="practice-title">{partLabel(part, items)}: {part.title.replace(/^Boss ticket, part \d+: /, '')}</span><span className={`ticket-badge ${isPassed(save, part.id) ? 'passed-badge' : ''}`}>{isPassed(save, part.id) ? <><Check size={12} /> Passed</> : 'Open'}</span><ArrowRight size={16} /></button>)}</div></section>;
    })}
    <p className="table-caption"><button className="text-button" onClick={onScratch}>Try a query in the scratchpad<ArrowRight size={14} /></button></p>
  </div>;
}
