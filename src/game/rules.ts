import type { ItemMeta } from '../data/itemIndex';
import { emptyProgress, type ChapterProgress, type Outcome, type SaveV5, type Streak, type TicketProgress } from '../save/format';
import { appendMistake, withMiss, withReview, appendReviewOutcome } from './review';

// The game rules as pure functions: XP, hint costs, levels, ranks, gating, mastery, reveals, streaks, badges and readiness.
// The numbers here are the source of truth. CLAUDE.md documents them and tests/game-rules.test.ts pins them.

export type Kind = 'guided' | 'independent' | 'boss';

export const BASE_XP: Readonly<Record<Kind, number>> = { guided: 10, independent: 25, boss: 50 };
export const FIRST_TRY_BONUS: Readonly<Record<Kind, number>> = { guided: 5, independent: 10, boss: 15 };
export const HINT_COST = 5;
export const REVEAL_XP = 5;
export const REPEAT_XP = 1;
export const STREAK_ITEMS = 3;
export const READINESS_WINDOW = 10;
export const READINESS_MINIMUM = 5;
export const READY_AT = 0.8;
export const CREDIT: Readonly<Record<Outcome, number>> = { 'first-try': 1, hinted: 0.5, revealed: 0 };
// A review attempt's credit: first try 1, a hint 0.5, a reveal or a failure 0. The first pass of a ticket uses CREDIT.
export const REVIEW_HINTED_CREDIT = 0.5;

// Sample tickets sit in the independent list, so they earn independent XP. Readiness scores only independent and boss tickets.
export const kindOf = (item: Pick<ItemMeta, 'role'>): Kind => (item.role === 'boss' ? 'boss' : item.role === 'guided' ? 'guided' : 'independent');
export const isScored = (item: Pick<ItemMeta, 'role'>): boolean => item.role === 'independent' || item.role === 'boss';

// The first pass sets the award. Each hint tier taken before it costs HINT_COST, and the award never falls below 0.
export function awardFor(kind: Kind, outcome: Outcome, hintTier: number): number {
  if (outcome === 'revealed') return REVEAL_XP;
  if (outcome === 'first-try') return BASE_XP[kind] + FIRST_TRY_BONUS[kind];
  return Math.max(0, BASE_XP[kind] - HINT_COST * hintTier);
}

export function outcomeOf(ticket: Pick<TicketProgress, 'failures' | 'hintTier' | 'solutionRevealed'>): Outcome {
  if (ticket.solutionRevealed) return 'revealed';
  return ticket.failures === 0 && ticket.hintTier === 0 ? 'first-try' : 'hinted';
}

// Level n starts at 100(n-1) + 25(n-1)(n-2) XP: 0, 100, 250, 450, 700, 1000, ... Each level needs 50 XP more than the one before.
export const levelStart = (level: number): number => 100 * (level - 1) + 25 * (level - 1) * (level - 2);

export function levelOf(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  while (levelStart(level + 1) <= xp) level += 1;
  return { level, into: xp - levelStart(level), span: levelStart(level + 1) - levelStart(level) };
}

export const totalXp = (save: Pick<SaveV5, 'tickets'>): number => Object.values(save.tickets).reduce((sum, ticket) => sum + ticket.xp, 0);

// Ranks follow mastery, not XP. The highest rank whose chapter is mastered is the current rank.
export const RANKS: readonly { name: string; chapter: number }[] = [
  { name: 'Intern', chapter: 0 },
  { name: 'Junior Analyst', chapter: 3 },
  { name: 'Analyst', chapter: 6 },
  { name: 'Junior Data Engineer', chapter: 9 },
  { name: 'Data Engineer I', chapter: 13 },
];

export const isMastered = (save: Pick<SaveV5, 'chapters'>, chapterId: number): boolean => save.chapters[String(chapterId)] !== undefined;

export function rankOf(save: Pick<SaveV5, 'chapters'>): string {
  let rank = RANKS[0]!.name;
  for (const entry of RANKS) if (entry.chapter === 0 || isMastered(save, entry.chapter)) rank = entry.name;
  return rank;
}

// Chapter 1 is open. Any other chapter opens when the one before it is mastered. A mastered chapter stays open.
export function isOpen(save: Pick<SaveV5, 'chapters'>, chapterId: number): boolean {
  return chapterId === 1 || isMastered(save, chapterId) || isMastered(save, chapterId - 1);
}

export const chapterIdsOf = (items: readonly ItemMeta[]): number[] => [...new Set(items.map((item) => item.chapterId))].sort((a, b) => a - b);

export const bossGroupsOf = (items: readonly ItemMeta[], chapterId: number): string[] => [...new Set(items
  .filter((item) => item.chapterId === chapterId && item.bossGroup !== undefined)
  .map((item) => item.bossGroup!))];

// A boss part's pass counts when it was not voided by a reveal after it. Samples and guided tickets never need this check.
export function partCounts(ticket: TicketProgress | undefined): boolean {
  return ticket !== undefined && ticket.passedAt !== null && (ticket.revealedAt === null || ticket.passedAt > ticket.revealedAt);
}

export function groupCounts(items: readonly ItemMeta[], save: Pick<SaveV5, 'tickets'>, group: string): boolean {
  const parts = items.filter((item) => item.bossGroup === group);
  return parts.length > 0 && parts.every((part) => partCounts(save.tickets[part.id]));
}

export function chapterBossesPass(items: readonly ItemMeta[], save: Pick<SaveV5, 'tickets'>, chapterId: number): boolean {
  const groups = bossGroupsOf(items, chapterId);
  return groups.length > 0 && groups.every((group) => groupCounts(items, save, group));
}

// Test-out: the chapter was mastered before any of its lesson sections were answered and before any of its non-boss tickets passed.
export function masteryMethod(items: readonly ItemMeta[], save: SaveV5, chapterId: number): ChapterProgress['method'] {
  const touched = items.some((item) => item.chapterId === chapterId && item.bossGroup === undefined && save.tickets[item.id]?.passed === true)
    || Object.entries(save.lessons).some(([id, lesson]) => id.startsWith(`c${chapterId}-s`) && lesson.answer !== null);
  return touched ? 'boss' : 'test-out';
}

// Reveal rule: the reveal never adds XP or mastery. For a boss part it voids the current pass until a later pass that differs from the solution.
// A reveal is a logged miss: it resets the ticket's review schedule and the mistake log records it.
export function revealSolution(save: SaveV5, item: ItemMeta, at: number, day: string): SaveV5 {
  const ticket = save.tickets[item.id] ?? emptyProgress();
  if (ticket.solutionRevealed) return save;
  const next: SaveV5 = { ...save, tickets: { ...save.tickets, [item.id]: { ...ticket, solutionRevealed: true, revealedAt: at } } };
  return {
    ...next,
    ...appendMistake(next, { at, day, itemId: item.id, competency: item.chapterId, tag: null, kind: 'revealed' }),
    reviews: withMiss(next.reviews, item.id, null, day),
  };
}

export function takeHint(save: SaveV5, itemId: string): SaveV5 {
  const ticket = save.tickets[itemId] ?? emptyProgress();
  return { ...save, tickets: { ...save.tickets, [itemId]: { ...ticket, hintTier: Math.min(3, ticket.hintTier + 1) } } };
}

// Queries count as the same when they differ only by whitespace, letter case or a trailing semicolon.
export const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim().toLowerCase();

// Local calendar day, 'YYYY-MM-DD', in the given time zone.
export function localDay(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Whole calendar days from one day to another. Date.UTC has no daylight saving, so 1 November in a DST zone is one day long.
export function dayGap(from: string, to: string): number {
  const ms = (day: string) => {
    const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export function recordStreakItem(streak: Streak, day: string, itemId: string): Streak {
  const items = streak.itemsDay === day ? streak.items : [];
  const next = items.includes(itemId) ? items : [...items, itemId];
  const countsDay = next.length >= STREAK_ITEMS && (streak.countedDay === null || day > streak.countedDay);
  if (!countsDay) return { ...streak, itemsDay: day, items: next };
  const current = streak.countedDay !== null && dayGap(streak.countedDay, day) === 1 ? streak.current + 1 : 1;
  return { ...streak, current, longest: Math.max(streak.longest, current), countedDay: day, itemsDay: day, items: next };
}

// A streak survives only when the last counted day is today or yesterday.
export function currentStreak(streak: Streak, today: string): number {
  if (streak.countedDay === null) return 0;
  return dayGap(streak.countedDay, today) <= 1 ? streak.current : 0;
}

export interface Badge { id: string; title: string; earned: (items: readonly ItemMeta[], save: SaveV5) => boolean }

const rankBadge = (id: string, title: string, chapter: number): Badge => ({ id, title, earned: (_items, save) => isMastered(save, chapter) });

export const BADGES: readonly Badge[] = [
  rankBadge('rank-junior-analyst', 'Junior Analyst', 3),
  rankBadge('rank-analyst', 'Analyst', 6),
  rankBadge('rank-junior-data-engineer', 'Junior Data Engineer', 9),
  rankBadge('rank-data-engineer-1', 'Data Engineer I', 13),
  {
    id: 'boss-first-try', title: 'Boss, first try',
    earned: (items, save) => bossGroupsOfAll(items).some((group) => groupCounts(items, save, group)
      && items.filter((item) => item.bossGroup === group).every((part) => save.tickets[part.id]?.firstOutcome === 'first-try')),
  },
  { id: 'ten-in-a-row', title: 'Ten in a row', earned: (_items, save) => save.longestRun >= 10 },
  { id: 'chapter-8-complete', title: 'Window functions', earned: (items, save) => chapterSolvedWithoutReveal(items, save, 8) },
  { id: 'chapter-11-complete', title: 'Pipelines', earned: (items, save) => chapterSolvedWithoutReveal(items, save, 11) },
  { id: 'streak-7', title: 'Seven-day streak', earned: (_items, save) => save.streak.longest >= 7 },
  { id: 'streak-30', title: 'Thirty-day streak', earned: (_items, save) => save.streak.longest >= 30 },
  { id: 'all-chapters', title: 'Every chapter mastered', earned: (items, save) => chapterIdsOf(items).every((id) => isMastered(save, id)) },
];

const bossGroupsOfAll = (items: readonly ItemMeta[]): string[] => [...new Set(items.map((item) => item.bossGroup).filter((group): group is string => group !== undefined))];

// Every item of the chapter passed, and none needed a reveal. Hints are allowed.
function chapterSolvedWithoutReveal(items: readonly ItemMeta[], save: SaveV5, chapterId: number): boolean {
  const chapterItems = items.filter((item) => item.chapterId === chapterId);
  return chapterItems.length > 0 && chapterItems.every((item) => save.tickets[item.id]?.passed === true && save.tickets[item.id]?.revealedAt === null);
}

// Mastery and badges follow from the tickets, so one pass through here settles both. Mastery is never taken back.
export function settle(items: readonly ItemMeta[], save: SaveV5, at: number): SaveV5 {
  let next = save;
  for (const chapterId of chapterIdsOf(items)) {
    if (isMastered(next, chapterId) || !chapterBossesPass(items, next, chapterId)) continue;
    next = { ...next, chapters: { ...next.chapters, [String(chapterId)]: { method: masteryMethod(items, next, chapterId), masteredAt: at } } };
  }
  const badges = { ...next.badges };
  for (const badge of BADGES) if (badges[badge.id] === undefined && badge.earned(items, next)) badges[badge.id] = at;
  return { ...next, badges };
}

// tag: the mistake tag the matched wrong variant carries, if any. reviewing: the attempt was a review, not a learning ticket.
// hinted and revealed describe that attempt, and only a review uses them.
export interface Grade { passed: boolean; sql: string; at: number; day: string; tag?: string | null; reviewing?: boolean; hinted?: boolean; revealed?: boolean }

export interface GradeResult {
  save: SaveV5;
  xp: number;
  // The outcome of this item's first pass, when this submission was that pass.
  outcome: Outcome | null;
  counted: boolean;
  // A boss submission that repeats the revealed solution does not count.
  copyOfReveal: boolean;
  // The new rank, when this submission changed it.
  promoted: string | null;
  badges: string[];
}

// A review attempt's credit. A reveal or a failure earns nothing; a hint halves the credit.
export const reviewCredit = (grade: Pick<Grade, 'revealed' | 'hinted'>): number => (grade.revealed === true ? 0 : grade.hinted === true ? REVIEW_HINTED_CREDIT : 1);

// Applies one graded submission. The learner's draft is kept by the caller, so this touches only progress.
export function applySubmission(save: SaveV5, items: readonly ItemMeta[], item: ItemMeta, referenceSql: string, grade: Grade): GradeResult {
  const none = { xp: 0, outcome: null, counted: false, copyOfReveal: false, promoted: null, badges: [] };
  if (!isOpen(save, item.chapterId)) return { save, ...none };
  const previous = save.tickets[item.id] ?? emptyProgress();
  const attempts = previous.attempts + 1;
  const reviewing = grade.reviewing === true;
  if (!grade.passed) {
    const ticket = { ...previous, attempts, failures: previous.failures + 1 };
    let failed: SaveV5 = { ...withTicket(save, item.id, ticket), ...appendMistake(save, { at: grade.at, day: grade.day, itemId: item.id, competency: item.chapterId, tag: grade.tag ?? null, kind: 'failed' }) };
    failed = { ...failed, reviews: withMiss(failed.reviews, item.id, grade.tag ?? null, grade.day) };
    if (reviewing) failed = recordReviewAttempt(failed, item, 0, grade.day, grade.at);
    return { save: failed, ...none };
  }
  const kind = kindOf(item);
  if (kind === 'boss' && previous.revealedAt !== null && normalizeSql(grade.sql) === normalizeSql(referenceSql)) {
    return { save: withTicket(save, item.id, { ...previous, attempts }), ...none, copyOfReveal: true };
  }
  const first = previous.firstOutcome === null;
  const outcome = previous.firstOutcome ?? outcomeOf(previous);
  const repeat = !first && previous.repeatDay !== grade.day;
  const xp = first ? awardFor(kind, outcome, previous.hintTier) : repeat ? REPEAT_XP : 0;
  const ticket: TicketProgress = {
    ...previous, attempts, passed: true, xp: previous.xp + xp,
    firstOutcome: outcome, firstPassAt: first ? grade.at : previous.firstPassAt,
    passedAt: grade.at, repeatDay: repeat ? grade.day : previous.repeatDay,
  };
  const independentRun = first && item.role === 'independent' ? (outcome === 'first-try' ? save.independentRun + 1 : 0) : save.independentRun;
  const before = rankOf(save);
  const earned = Object.keys(save.badges);
  let updated: SaveV5 = {
    ...withTicket(save, item.id, ticket),
    streak: recordStreakItem(save.streak, grade.day, item.id),
    independentRun,
    longestRun: Math.max(save.longestRun, independentRun),
  };
  if (reviewing) updated = recordReviewAttempt(updated, item, reviewCredit(grade), grade.day, grade.at);
  else if (first && isScored(item)) updated = recordScored(updated, item.chapterId, grade.at, CREDIT[outcome]);
  const settled = settle(items, updated, grade.at);
  const after = rankOf(settled);
  return {
    save: settled, xp, outcome: first ? outcome : null, counted: true, copyOfReveal: false,
    promoted: after === before ? null : after,
    badges: Object.keys(settled.badges).filter((id) => !earned.includes(id)),
  };
}

// A review attempt: its outcome joins the competency's review window, its schedule advances or resets, and a scored
// ticket adds its credit to the readiness window. A pass is any credit above zero. A ticket passes one review a day:
// a repeat pass after a review pass that day changes nothing, so a reload cannot add credit again.
function recordReviewAttempt(save: SaveV5, item: ItemMeta, credit: number, day: string, at: number): SaveV5 {
  const pass = credit > 0;
  const schedule = save.reviews.items[item.id];
  if (pass && schedule?.lastDay === day && schedule.lastOutcome === 'pass') return save;
  const next: SaveV5 = { ...save, reviewRecent: appendReviewOutcome(save.reviewRecent, item.chapterId, pass), reviews: withReview(save.reviews, item.id, pass, day) };
  return isScored(item) ? recordScored(next, item.chapterId, at, credit) : next;
}

function withTicket(save: SaveV5, itemId: string, ticket: TicketProgress): SaveV5 {
  return { ...save, tickets: { ...save.tickets, [itemId]: ticket } };
}

// Readiness: each competency keeps its most recent scored attempts, first passes and review attempts alike.
// Only the window matters, so the oldest attempt falls out when a new one is added.
export function recordScored(save: SaveV5, chapterId: number, at: number, credit: number): SaveV5 {
  const key = String(chapterId);
  return { ...save, readiness: { ...save.readiness, [key]: [...(save.readiness[key] ?? []), { at, credit }].slice(-READINESS_WINDOW) } };
}

export interface Readiness { chapterId: number; scored: number; score: number | null; ready: boolean }

export function readinessOf(save: Pick<SaveV5, 'readiness'>, chapterId: number): Readiness {
  const entries = save.readiness[String(chapterId)] ?? [];
  const scored = entries.length;
  const score = scored >= READINESS_MINIMUM ? entries.reduce((sum, entry) => sum + entry.credit, 0) / scored : null;
  return { chapterId, scored, score, ready: score !== null && score >= READY_AT };
}

export const readinessAll = (save: Pick<SaveV5, 'readiness'>, chapterIds: readonly number[]): Readiness[] =>
  chapterIds.map((chapterId) => readinessOf(save, chapterId));

// The entry-level signal appears only when every competency has a score and each one is at or above READY_AT.
export const entryLevelReady = (rows: readonly Readiness[]): boolean => rows.length > 0 && rows.every((row) => row.ready);

export type DeskStatus = 'locked' | 'open' | 'in-progress' | 'mastered' | 'tested-out';

export function deskStatus(items: readonly ItemMeta[], save: SaveV5, chapterId: number): DeskStatus {
  const mastered = save.chapters[String(chapterId)];
  if (mastered) return mastered.method === 'test-out' ? 'tested-out' : 'mastered';
  if (!isOpen(save, chapterId)) return 'locked';
  const lessonStarted = Object.entries(save.lessons).some(([id, lesson]) => id.startsWith(`c${chapterId}-s`) && lesson.answer !== null);
  const ticketStarted = items.some((item) => item.chapterId === chapterId && (save.tickets[item.id]?.attempts ?? 0) > 0);
  return lessonStarted || ticketStarted ? 'in-progress' : 'open';
}

export const DESK_LABEL: Readonly<Record<DeskStatus, string>> = {
  locked: 'Locked', open: 'Open', 'in-progress': 'In progress', mastered: 'Mastered', 'tested-out': 'Mastered by test-out',
};
