import { ArrowRight, Check, Lock, Table2, Trophy } from 'lucide-react';
import type { ItemMeta } from '../data/itemIndex';
import type { Chapter } from '../data/curriculum';
import { DESK_LABEL, deskStatus, partCounts } from '../game/rules';
import type { SaveV5 } from '../save/progress';
import { bossPartsOf, bossPassed, isPassed, itemsForChapter, partLabel, summarizeChapter } from './model';

export const lessonSectionIds = (chapterId: number): readonly string[] => [1, 2, 3].map((index) => `c${chapterId}-s${index}`);

// A boss part counts only while its pass is not voided by a reveal. A voided part must be passed again with the learner's own query.
function partState(part: ItemMeta, save: SaveV5): { label: string; passed: boolean } {
  const ticket = save.tickets[part.id];
  if (partCounts(ticket)) return { label: 'Passed', passed: true };
  if (ticket?.revealedAt !== undefined && ticket.revealedAt !== null) return { label: 'Revealed · pass again', passed: false };
  return { label: 'Open', passed: false };
}

export function ChapterView({ chapter, items, save, onLesson, onItem, onScratch, onBack }: {
  chapter: Chapter; items: readonly ItemMeta[]; save: SaveV5; onLesson: () => void; onItem: (item: ItemMeta) => void; onScratch: () => void; onBack: () => void;
}) {
  const summary = summarizeChapter(items, save, chapter.id, lessonSectionIds(chapter.id));
  const status = deskStatus(items, save, chapter.id);
  if (status === 'locked') {
    return <div className="chapter-main">
      <button className="text-button" onClick={onBack}>All desks</button>
      <section className="practice-section" aria-labelledby={`locked-${chapter.id}`}><h1 id={`locked-${chapter.id}`}>Chapter {chapter.id} is locked</h1><p>Master chapter {chapter.id - 1} to open this desk.</p></section>
    </div>;
  }
  const chapterItems = itemsForChapter(items, chapter.id);
  const guided = chapterItems.filter((item) => item.role === 'guided');
  const independent = chapterItems.filter((item) => item.role === 'independent' || item.role === 'sample');
  const bossGroups = [...new Set(chapterItems.map((item) => item.bossGroup).filter((group): group is string => Boolean(group)))];
  const testingOut = status === 'open';
  const row = (item: ItemMeta) => <button key={item.id} className="practice-row" onClick={() => { onItem(item); }}>
    <span className="practice-title">{item.title}</span>
    <span className={`ticket-badge ${isPassed(save, item.id) ? 'passed-badge' : ''}`}>{isPassed(save, item.id) ? <><Check size={12} /> Passed</> : save.tickets[item.id]?.draft ? 'In progress' : 'Open'}</span>
    <ArrowRight size={16} />
  </button>;
  return <div className="chapter-main">
    <button className="text-button" onClick={onBack}>All desks</button>
    <header className="chapter-header"><p className="eyebrow">CHAPTER {chapter.id} · <span className={`desk-status status-${status}`}>{DESK_LABEL[status]}</span></p><h1>{chapter.title}</h1><p className="intro-copy">{summary.passed} of {summary.graded} tickets passed. Mastery needs every boss part to pass.</p>
      <ul className="objective-list">{chapter.objectives.map((objective) => <li key={objective.id}>{objective.title}</li>)}</ul>
    </header>
    <section className="practice-section" aria-labelledby={`lesson-${chapter.id}`}><h2 id={`lesson-${chapter.id}`}>Lesson</h2><p>{summary.lessonsDone} of {summary.lessonCount} predictions answered correctly.</p><button className="primary-button" onClick={onLesson}><Table2 size={15} />{summary.lessonsDone === summary.lessonCount ? 'Review the lesson' : 'Open the lesson'}</button></section>
    <section className="practice-section" aria-labelledby={`guided-${chapter.id}`}><h2 id={`guided-${chapter.id}`}>Guided practice</h2><p>Fill the blanks, run the query, then submit.</p><div className="practice-list">{guided.map(row)}</div></section>
    <section className="practice-section" aria-labelledby={`independent-${chapter.id}`}><h2 id={`independent-${chapter.id}`}>Independent tickets</h2><div className="practice-list">{independent.map(row)}</div></section>
    {bossGroups.map((group) => {
      const parts = bossPartsOf(items, group);
      const passed = bossPassed(items, save, group);
      return <section className="practice-section boss-section" key={group} aria-labelledby={`boss-${group}`}>
        <h2 id={`boss-${group}`}>Boss ticket <span className={`ticket-badge ${passed ? 'passed-badge' : ''}`}>{passed ? <><Trophy size={12} /> Boss passed</> : `${parts.filter((part) => partState(part, save).passed).length} of ${parts.length} parts`}</span></h2>
        {testingOut && <p className="test-out-note"><strong>Test-out.</strong> Pass every part without the lessons to master this chapter. It is marked Mastered by test-out.</p>}
        <p>Every part must pass before the boss counts. A part whose solution you revealed must be passed again with your own query.</p>
        <div className="practice-list">{parts.map((part) => {
          const state = partState(part, save);
          return <button key={part.id} className="practice-row" onClick={() => { onItem(part); }}><span className="practice-title">{partLabel(part, items)}: {part.title.replace(/^Boss ticket, part \d+: /, '')}</span><span className={`ticket-badge ${state.passed ? 'passed-badge' : ''}`}>{state.passed ? <><Check size={12} /> {state.label}</> : state.label}</span><ArrowRight size={16} /></button>;
        })}</div>
      </section>;
    })}
    <p className="table-caption"><button className="text-button" onClick={onScratch}>Try a query in the scratchpad<ArrowRight size={14} /></button></p>
    {status === 'mastered' || status === 'tested-out' ? <p className="table-caption"><Lock size={12} /> Mastery is kept. Later reveals do not change it.</p> : null}
  </div>;
}
