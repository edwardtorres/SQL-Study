import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { loadItem } from '../data/items/loader';
import type { ItemMeta } from '../data/itemIndex';
import { itemTags } from '../data/itemTags';
import { lessons } from '../data/lessons';
import { weakSpots, WEAK_TAG_COUNT } from '../game/review';
import { isOpen, type Readiness } from '../game/rules';
import type { SaveV4 } from '../save/progress';

interface Props {
  items: readonly ItemMeta[];
  save: SaveV4;
  scores: readonly Readiness[];
  chapterTitle: (chapterId: number) => string;
  onOpen: (item: ItemMeta) => void;
  onLesson: (chapterId: number) => void;
  onBack: () => void;
}

interface TagRow { tag: string; count: number; practice: readonly ItemMeta[] }

// Practice tickets per mistake tag: open chapters' tickets that model the tag, in index order.
const PRACTICE_PER_TAG = 3;

// The lesson's common-mistakes entry for each tag. The first lesson section that names the tag wins.
const lessonEntry = new Map<string, { chapterId: number; text: string }>();
for (const lesson of lessons) {
  for (const section of lesson.sections) {
    for (const mistake of section.commonMistakes) {
      if (!lessonEntry.has(mistake.mistake)) lessonEntry.set(mistake.mistake, { chapterId: lesson.chapterId, text: mistake.text });
    }
  }
}

// The most frequent logged mistakes, each with the practice tickets that model it. Memoised on the save, so the
// variant explanations below load once per save rather than once per render.
function tagRowsOf(items: readonly ItemMeta[], save: SaveV4): TagRow[] {
  return weakSpots(save, []).tags.map(({ tag, count }) => ({
    tag,
    count,
    practice: items
      .filter((item) => isOpen(save, item.chapterId) && (itemTags[item.id] as readonly string[] | undefined)?.includes(tag) === true)
      .slice(0, PRACTICE_PER_TAG),
  }));
}

// Tags with no lesson entry are explained by the variant that carries them. Each is read from its first practice ticket that has one.
function useVariantExplanations(rows: readonly TagRow[]): Record<string, string> {
  const [found, setFound] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const row of rows) {
        if (lessonEntry.has(row.tag)) continue;
        for (const item of row.practice) {
          const challenge = await loadItem(item.id).catch(() => null);
          const variant = challenge?.wrongVariants.find((candidate) => candidate.mistake === row.tag);
          if (variant === undefined) continue;
          if (!cancelled) setFound((previous) => ({ ...previous, [row.tag]: variant.explanation }));
          break;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rows]);
  return found;
}

// Weak Spots: competencies from the weakest readiness, the mistakes logged most often, revealed tickets and failed ones.
export default function WeakSpots({ items, save, scores, chapterTitle, onOpen, onLesson, onBack }: Props) {
  const spots = weakSpots(save, scores);
  const tagRows = useMemo(() => tagRowsOf(items, save), [items, save]);
  const explanations = useVariantExplanations(tagRows);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ticketsFor = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((item): item is ItemMeta => item !== undefined);
  const ticketButton = (item: ItemMeta) => <button key={item.id} className="practice-row" onClick={() => { onOpen(item); }}>
    <span className="practice-title">{item.title}</span><ArrowRight size={16} />
  </button>;
  return <div className="chapter-main">
    <button className="text-button" onClick={onBack}><ArrowLeft size={15} />All desks</button>
    <header className="chapter-header">
      <p className="eyebrow">REVIEW</p>
      <h1>Weak Spots</h1>
      <p className="intro-copy">Where your readiness is lowest, the mistakes you make most often, and the tickets to look at again.</p>
    </header>
    <section className="practice-section" aria-labelledby="weak-competencies">
      <h2 id="weak-competencies">Competencies, weakest first</h2>
      <ol className="weak-list">{spots.competencies.map((row) => <li key={row.chapterId} className="readiness-row">
        <span>{chapterTitle(row.chapterId)}</span>
        {row.score === null
          ? <span className="muted">Not enough data · {row.scored} of 5 scored</span>
          : <span className={row.score >= 0.8 ? 'readiness-ready' : ''}>{Math.round(row.score * 100)}% · {row.scored} scored</span>}
      </li>)}</ol>
    </section>
    <section className="practice-section" aria-labelledby="weak-tags">
      <h2 id="weak-tags">Mistakes you make most</h2>
      {tagRows.length === 0 && <p>No mistakes logged yet. A wrong answer that matches a known mistake shows up here.</p>}
      {tagRows.map((row) => {
        const lesson = lessonEntry.get(row.tag);
        return <article key={row.tag} className="weak-tag">
          <p className="weak-tag-head"><code>{row.tag}</code><span>{row.count} {row.count === 1 ? 'time' : 'times'}</span></p>
          <p>{lesson?.text ?? explanations[row.tag] ?? 'Open a practice ticket below to see this mistake explained.'}</p>
          <div className="button-row">
            {lesson && <button className="secondary-button" onClick={() => { onLesson(lesson.chapterId); }}><BookOpen size={15} />Lesson, chapter {lesson.chapterId}</button>}
            {row.practice.map((item) => <button key={item.id} className="text-button" onClick={() => { onOpen(item); }}>Practice: {item.title}<ArrowRight size={14} /></button>)}
          </div>
        </article>;
      })}
      {tagRows.length > 0 && <p className="table-caption">The {Math.min(WEAK_TAG_COUNT, tagRows.length)} most frequent tags, counted over every logged mistake.</p>}
    </section>
    <section className="practice-section" aria-labelledby="weak-revealed">
      <h2 id="weak-revealed">Revealed tickets</h2>
      {spots.revealed.length === 0 ? <p>No solutions revealed.</p> : <div className="practice-list">{ticketsFor(spots.revealed).map(ticketButton)}</div>}
    </section>
    <section className="practice-section" aria-labelledby="weak-failed">
      <h2 id="weak-failed">Failed and not yet passed</h2>
      {spots.failed.length === 0 ? <p>Nothing failed without a pass.</p> : <div className="practice-list">{ticketsFor(spots.failed).map(ticketButton)}</div>}
      {spots.failed.length > 0 && <p className="table-caption">A ticket stays here until it passes.</p>}
    </section>
  </div>;
}
