import type { ItemMeta } from '../data/itemIndex';
import { itemTags } from '../data/itemTags';
import type { MistakeEntry, Schedule, SaveV6 } from '../save/format';

// Spaced review by mistake: schedules, the mistake log, the Daily Review set, needs-review and Weak Spots.
// Pure functions. They do not import the rules, so the rules can call them. The numbers are documented in
// CLAUDE.md and pinned by tests/review.test.ts.

export const REVIEW_INTERVALS = [1, 2, 4, 7, 14, 30] as const;
export const DAILY_REVIEW_CAP = 5;
export const NEEDS_REVIEW_WINDOW = 5;
// Below this pass rate over the window, a competency needs review.
export const NEEDS_REVIEW_BELOW = 0.6;
export const NEEDS_REVIEW_SET_SIZE = 3;
export const MISTAKE_LOG_CAP = 500;
export const WEAK_TAG_COUNT = 5;

export type Reviews = SaveV6['reviews'];

// Whole calendar days from a 'YYYY-MM-DD' day. Date.UTC has no daylight saving, so day arithmetic is exact.
export function addDays(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

// A pass moves one step along REVIEW_INTERVALS, capped at the last. A miss resets to step 0, due tomorrow.
export function scheduleAfter(previous: Schedule | undefined, pass: boolean, day: string): Schedule {
  const step = pass ? Math.min((previous?.step ?? -1) + 1, REVIEW_INTERVALS.length - 1) : 0;
  return { step, dueDay: addDays(day, REVIEW_INTERVALS[step]!), lastDay: day, lastOutcome: pass ? 'pass' : 'miss' };
}

export const isDue = (schedule: Schedule | undefined, day: string): boolean => schedule !== undefined && schedule.dueDay <= day;

// A failed or revealed attempt: the ticket and the tag it matched are reset to step 0.
export function withMiss(reviews: Reviews, itemId: string, tag: string | null, day: string): Reviews {
  return {
    items: { ...reviews.items, [itemId]: scheduleAfter(undefined, false, day) },
    tags: tag === null ? reviews.tags : { ...reviews.tags, [tag]: scheduleAfter(reviews.tags[tag], false, day) },
  };
}

// A review attempt: the ticket and every tag it models advance on a pass, and reset on a miss.
export function withReview(reviews: Reviews, itemId: string, pass: boolean, day: string): Reviews {
  const tags: Record<string, Schedule> = { ...reviews.tags };
  for (const tag of itemTags[itemId] ?? []) tags[tag] = scheduleAfter(reviews.tags[tag], pass, day);
  return { items: { ...reviews.items, [itemId]: scheduleAfter(reviews.items[itemId], pass, day) }, tags };
}

// Totals are never trimmed, so Weak Spots keeps every count after the log has been capped.
export function appendMistake(save: Pick<SaveV6, 'mistakeLog' | 'mistakeTotals'>, entry: MistakeEntry): Pick<SaveV6, 'mistakeLog' | 'mistakeTotals'> {
  const key = String(entry.competency);
  return {
    mistakeLog: [...save.mistakeLog, entry].slice(-MISTAKE_LOG_CAP),
    mistakeTotals: {
      tags: entry.tag === null ? save.mistakeTotals.tags : { ...save.mistakeTotals.tags, [entry.tag]: (save.mistakeTotals.tags[entry.tag] ?? 0) + 1 },
      competencies: { ...save.mistakeTotals.competencies, [key]: (save.mistakeTotals.competencies[key] ?? 0) + 1 },
    },
  };
}

export function appendReviewOutcome(recent: SaveV6['reviewRecent'], chapterId: number, pass: boolean): SaveV6['reviewRecent'] {
  const key = String(chapterId);
  const outcome: 'pass' | 'miss' = pass ? 'pass' : 'miss';
  return { ...recent, [key]: [...(recent[key] ?? []), outcome].slice(-NEEDS_REVIEW_WINDOW) };
}

// Needs review: the last NEEDS_REVIEW_WINDOW review attempts in a competency, with a pass rate below the threshold.
// Fewer attempts than the window never shows the mark.
export function needsReview(save: Pick<SaveV6, 'reviewRecent'>, chapterId: number): boolean {
  const recent = (save.reviewRecent[String(chapterId)] ?? []).slice(-NEEDS_REVIEW_WINDOW);
  if (recent.length < NEEDS_REVIEW_WINDOW) return false;
  return recent.filter((outcome) => outcome === 'pass').length / recent.length < NEEDS_REVIEW_BELOW;
}

// The candidate pool: chapter tickets the learner has seen, in chapters that are open.
export interface ReviewPool { items: readonly ItemMeta[]; isOpen: (chapterId: number) => boolean }

const seen = (save: Pick<SaveV6, 'tickets'>, id: string): boolean => (save.tickets[id]?.attempts ?? 0) > 0;
// Least recently passed first. A ticket never passed sorts before any passed one.
const recency = (save: Pick<SaveV6, 'tickets'>, id: string): number => save.tickets[id]?.passedAt ?? -1;
const eligible = (save: Pick<SaveV6, 'tickets'>, pool: ReviewPool, picked: ReadonlySet<string>, item: ItemMeta): boolean =>
  !picked.has(item.id) && seen(save, item.id) && pool.isOpen(item.chapterId);
const byRecency = (save: Pick<SaveV6, 'tickets'>) => (a: ItemMeta, b: ItemMeta) => recency(save, a.id) - recency(save, b.id) || a.id.localeCompare(b.id);

// The Daily Review set. A set saved for today is returned as it was, so a reload does not reshuffle it.
// Due mistake tags come first, oldest due first. Each picks one ticket that models the tag, excluding the ticket
// that was failed most recently for that tag. The set is then topped up from the weakest competencies, in order.
export function dailyReviewSet(save: SaveV6, day: string, weakestFirst: readonly number[], pool: ReviewPool): string[] {
  if (save.dailyReview?.day === day) return [...save.dailyReview.itemIds];
  const picked: string[] = [];
  const taken = new Set<string>();
  const take = (item: ItemMeta) => { picked.push(item.id); taken.add(item.id); };
  const dueTags = Object.entries(save.reviews.tags)
    .filter(([, schedule]) => isDue(schedule, day))
    .sort(([tagA, a], [tagB, b]) => a.dueDay.localeCompare(b.dueDay) || tagA.localeCompare(tagB))
    .map(([tag]) => tag);
  for (const tag of dueTags) {
    if (picked.length >= DAILY_REVIEW_CAP) break;
    const failedLast = [...save.mistakeLog].reverse().find((entry) => entry.tag === tag)?.itemId;
    const choice = pool.items
      .filter((item) => item.id !== failedLast && (itemTags[item.id] as readonly string[] | undefined)?.includes(tag) === true)
      .filter((item) => eligible(save, pool, taken, item))
      .sort(byRecency(save))[0];
    if (choice) take(choice);
  }
  for (const chapterId of weakestFirst) {
    if (picked.length >= DAILY_REVIEW_CAP) break;
    const candidates = pool.items.filter((item) => item.chapterId === chapterId && eligible(save, pool, taken, item)).sort(byRecency(save));
    for (const candidate of candidates) {
      if (picked.length >= DAILY_REVIEW_CAP) break;
      take(candidate);
    }
  }
  return picked;
}

// A needs-review set: the least recently passed seen tickets in the competency.
export function needsReviewSet(save: SaveV6, chapterId: number, pool: ReviewPool): string[] {
  return pool.items
    .filter((item) => item.chapterId === chapterId && seen(save, item.id) && pool.isOpen(item.chapterId))
    .sort(byRecency(save))
    .slice(0, NEEDS_REVIEW_SET_SIZE)
    .map((item) => item.id);
}

export interface CompetencyScore { chapterId: number; score: number | null; scored: number }

// Weak Spots: competencies from the weakest score up (unscored last), the most frequent mistake tags,
// revealed tickets (most recent first) and unpassed tickets that have failed.
export interface WeakSpots {
  competencies: CompetencyScore[];
  tags: { tag: string; count: number }[];
  revealed: string[];
  failed: string[];
}

export function weakSpots(save: Pick<SaveV6, 'tickets' | 'mistakeTotals'>, scores: readonly CompetencyScore[]): WeakSpots {
  const competencies = [...scores].sort((a, b) =>
    (a.score === null ? 1 : 0) - (b.score === null ? 1 : 0) || (a.score ?? 0) - (b.score ?? 0) || a.chapterId - b.chapterId);
  const tags = Object.entries(save.mistakeTotals.tags)
    .sort(([tagA, a], [tagB, b]) => b - a || tagA.localeCompare(tagB))
    .slice(0, WEAK_TAG_COUNT)
    .map(([tag, count]) => ({ tag, count }));
  const revealed = Object.entries(save.tickets)
    .filter(([, ticket]) => ticket.solutionRevealed)
    .sort(([, a], [, b]) => (b.revealedAt ?? 0) - (a.revealedAt ?? 0))
    .map(([id]) => id);
  const failed = Object.entries(save.tickets)
    .filter(([, ticket]) => !ticket.passed && ticket.failures > 0)
    .map(([id]) => id);
  return { competencies, tags, revealed, failed };
}
