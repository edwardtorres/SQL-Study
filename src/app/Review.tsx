import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { ItemMeta } from '../data/itemIndex';
import type { SaveV6 } from '../save/progress';
import { isPassed } from './model';

interface Props {
  mode: 'daily' | 'needs';
  items: readonly ItemMeta[];
  save: SaveV6;
  // The ticket ids for this page, in order. Daily Review's set is saved per day; a needs-review set is recomputed.
  ids: readonly string[];
  // The desk's title, shown on a needs-review page.
  chapterTitle: string | undefined;
  onOpen: (item: ItemMeta) => void;
  onBack: () => void;
}

// The Daily Review page and a desk's needs-review page share this list. Each row opens its ticket in review mode.
export default function Review({ mode, items, save, ids, chapterTitle, onOpen, onBack }: Props) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows = ids.map((id) => byId.get(id)).filter((item): item is ItemMeta => item !== undefined);
  const daily = mode === 'daily';
  return <div className="chapter-main">
    <button className="text-button" onClick={onBack}><ArrowLeft size={15} />All desks</button>
    <header className="chapter-header">
      <p className="eyebrow">REVIEW · {daily ? 'TODAY' : (chapterTitle ?? '').toUpperCase()}</p>
      <h1>{daily ? 'Daily Review' : 'Needs review'}</h1>
      <p className="intro-copy">{daily
        ? 'Up to five tickets a day, chosen from the mistakes you have logged. Today’s set stays the same when you reload.'
        : 'Most of your recent reviews in this desk were misses. These are the seen tickets you passed longest ago.'}</p>
    </header>
    <section className="practice-section" aria-labelledby="review-list-title">
      <h2 id="review-list-title">{daily ? 'Today’s set' : 'Tickets to review'}</h2>
      {rows.length === 0
        ? <p>{daily ? 'Nothing is due yet. Make a few mistakes on tickets you have started, then come back.' : 'No seen tickets in this desk yet.'}</p>
        : <div className="practice-list">{rows.map((item) => <button key={item.id} className="practice-row" onClick={() => { onOpen(item); }}>
          <span className="practice-title">{item.title}<span className="practice-meta"> · Chapter {item.chapterId}</span></span>
          <span className={`ticket-badge ${isPassed(save, item.id) ? 'passed-badge' : ''}`}>{isPassed(save, item.id) ? <><Check size={12} /> Passed</> : 'Not passed yet'}</span>
          <ArrowRight size={16} />
        </button>)}</div>}
    </section>
  </div>;
}
