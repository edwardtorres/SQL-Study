import type { ItemMeta } from '../data/itemIndex';
import { emptySave, type ChapterProgress, type Outcome, type SaveV3, type Streak, type TicketProgress } from './format';
import { migrateToV3, readLegacy } from './migrations';
import { ID, dayOrNull, integer, object, readActive, readLessons, stamp, stampOrNull } from './validate';

export * from './format';

export interface RestoredSave {
  save: SaveV3;
  status: 'fresh' | 'restored' | 'migrated' | 'corrupt' | 'future';
  writable: boolean;
}

const OUTCOMES: readonly string[] = ['first-try', 'hinted', 'revealed'];
const CHAPTER = /^(?:[1-9]|1[0-3])$/;

function readTicket(value: unknown): TicketProgress {
  if (!object(value) || typeof value.draft !== 'string' || value.draft.length > 20_000) throw new Error('Invalid ticket');
  if (!integer(value.attempts, 1_000_000) || !integer(value.failures, 1_000_000) || value.failures > value.attempts) throw new Error('Invalid ticket');
  if (typeof value.passed !== 'boolean' || !integer(value.hintTier, 3) || typeof value.solutionRevealed !== 'boolean' || !integer(value.xp, 100_000)) throw new Error('Invalid ticket');
  const outcome = value.firstOutcome;
  if (outcome !== null && !(typeof outcome === 'string' && OUTCOMES.includes(outcome))) throw new Error('Invalid ticket');
  if (!stampOrNull(value.firstPassAt) || !stampOrNull(value.passedAt) || !stampOrNull(value.revealedAt) || !dayOrNull(value.repeatDay)) throw new Error('Invalid ticket');
  // A pass has an outcome and a first-pass time, and nothing else does. A pass time needs a pass.
  if (value.passed !== (outcome !== null) || value.passed !== (value.firstPassAt !== null)) throw new Error('Invalid ticket');
  if (value.passedAt !== null && !value.passed) throw new Error('Invalid ticket');
  return {
    draft: value.draft, attempts: value.attempts, failures: value.failures, passed: value.passed, hintTier: value.hintTier,
    solutionRevealed: value.solutionRevealed, xp: value.xp, firstOutcome: outcome as Outcome | null,
    firstPassAt: value.firstPassAt, passedAt: value.passedAt, revealedAt: value.revealedAt, repeatDay: value.repeatDay,
  };
}

function readTickets(value: Record<string, unknown>): Record<string, TicketProgress> {
  const tickets: Record<string, TicketProgress> = {};
  for (const [id, ticket] of Object.entries(value)) {
    if (!ID.test(id)) throw new Error('Invalid ticket');
    tickets[id] = readTicket(ticket);
  }
  return tickets;
}

function readChapters(value: Record<string, unknown>): Record<string, ChapterProgress> {
  const chapters: Record<string, ChapterProgress> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!CHAPTER.test(key) || !object(entry) || (entry.method !== 'boss' && entry.method !== 'test-out') || !stamp(entry.masteredAt)) throw new Error('Invalid chapter');
    chapters[key] = { method: entry.method, masteredAt: entry.masteredAt };
  }
  return chapters;
}

function readStreak(value: unknown): Streak {
  if (!object(value) || !integer(value.current, 100_000) || !integer(value.longest, 100_000) || value.current > value.longest) throw new Error('Invalid streak');
  if (!dayOrNull(value.countedDay) || !dayOrNull(value.itemsDay)) throw new Error('Invalid streak');
  if (!Array.isArray(value.items) || value.items.length > 1_000 || !value.items.every((id) => typeof id === 'string' && ID.test(id))) throw new Error('Invalid streak');
  if (value.items.length > 0 && value.itemsDay === null) throw new Error('Invalid streak');
  return { current: value.current, longest: value.longest, countedDay: value.countedDay, itemsDay: value.itemsDay, items: [...value.items] as string[] };
}

function readBadges(value: Record<string, unknown>): Record<string, number> {
  const badges: Record<string, number> = {};
  for (const [id, at] of Object.entries(value)) {
    if (!ID.test(id) || !stamp(at)) throw new Error('Invalid badge');
    badges[id] = at;
  }
  return badges;
}

function readV3(value: Record<string, unknown>): SaveV3 {
  if (!object(value.tickets) || !object(value.lessons) || !object(value.chapters) || !object(value.badges)) throw new Error('Invalid save');
  if (!integer(value.independentRun, 100_000) || !integer(value.longestRun, 100_000) || value.independentRun > value.longestRun) throw new Error('Invalid save');
  return {
    version: 3,
    activeTicket: readActive(value.activeTicket),
    tickets: readTickets(value.tickets),
    lessons: readLessons(value.lessons),
    chapters: readChapters(value.chapters),
    streak: readStreak(value.streak),
    independentRun: value.independentRun,
    longestRun: value.longestRun,
    badges: readBadges(value.badges),
  };
}

// Reads any save this app can open. Versions 0 to 2 are migrated in memory and rewritten as version 3 on the next change.
// A save from a newer version is never overwritten. An unreadable save is preserved and the session runs without saving.
export function restoreSave(raw: string | null, items: readonly ItemMeta[]): RestoredSave {
  if (raw === null) return { save: emptySave(), status: 'fresh', writable: true };
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value)) throw new Error('Invalid save');
    if (typeof value.version === 'number' && value.version > 3) return { save: emptySave(), status: 'future', writable: false };
    if (value.version === 3) return { save: readV3(value), status: 'restored', writable: true };
    return { save: migrateToV3(readLegacy(value), items), status: 'migrated', writable: true };
  } catch {
    return { save: emptySave(), status: 'corrupt', writable: false };
  }
}
