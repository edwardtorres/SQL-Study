import type { ItemMeta } from '../data/itemIndex';
import { mistakeTags } from '../core/types';
import { emptySave, type ChapterProgress, type MistakeEntry, type Outcome, type SaveV3, type SaveV4, type ScoredAttempt, type Schedule, type Streak, type TicketProgress } from './format';
import { migrateV2ToV4, migrateV3ToV4, readLegacy } from './migrations';
import { ID, dayOrNull, day as isDay, integer, object, readActive, readLessons, stamp, stampOrNull } from './validate';

export * from './format';

export interface RestoredSave {
  save: SaveV4;
  status: 'fresh' | 'restored' | 'migrated' | 'corrupt' | 'future';
  writable: boolean;
}

const OUTCOMES: readonly string[] = ['first-try', 'hinted', 'revealed'];
const CHAPTER = /^(?:[1-9]|1[0-3])$/;
const TAGS: readonly string[] = mistakeTags;
const CREDITS: readonly number[] = [0, 0.5, 1];
const READINESS_WINDOW = 10;
const REVIEW_WINDOW = 5;
const MISTAKE_LOG_CAP = 500;
const DAILY_CAP = 5;

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

// Version 4 additions. Each is checked against the rules that write it: chapters 1 to 13, tags from the taxonomy,
// credits from the three weights, and windows and caps the code keeps.
function readReadiness(value: Record<string, unknown>): Record<string, ScoredAttempt[]> {
  const readiness: Record<string, ScoredAttempt[]> = {};
  for (const [key, entries] of Object.entries(value)) {
    if (!CHAPTER.test(key) || !Array.isArray(entries) || entries.length > READINESS_WINDOW) throw new Error('Invalid readiness');
    readiness[key] = entries.map((entry) => {
      if (!object(entry) || !stamp(entry.at) || typeof entry.credit !== 'number' || !CREDITS.includes(entry.credit)) throw new Error('Invalid readiness');
      return { at: entry.at, credit: entry.credit };
    });
  }
  return readiness;
}

function readMistakeLog(value: unknown): MistakeEntry[] {
  if (!Array.isArray(value) || value.length > MISTAKE_LOG_CAP) throw new Error('Invalid mistake log');
  return value.map((entry) => {
    if (!object(entry) || !stamp(entry.at) || !isDay(entry.day) || !ID.test(String(entry.itemId)) || !integer(entry.competency, 13) || entry.competency < 1) throw new Error('Invalid mistake log');
    if (entry.tag !== null && !(typeof entry.tag === 'string' && TAGS.includes(entry.tag))) throw new Error('Invalid mistake log');
    if (entry.kind !== 'failed' && entry.kind !== 'revealed') throw new Error('Invalid mistake log');
    if (typeof entry.itemId !== 'string') throw new Error('Invalid mistake log');
    return { at: entry.at, day: entry.day, itemId: entry.itemId, competency: entry.competency, tag: entry.tag, kind: entry.kind };
  });
}

function readCounts(value: Record<string, unknown>, valid: (key: string) => boolean): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!valid(key) || !integer(count, 1_000_000)) throw new Error('Invalid mistake totals');
    counts[key] = count;
  }
  return counts;
}

function readSchedule(value: unknown): Schedule {
  if (!object(value) || !integer(value.step, 5) || !isDay(value.dueDay) || !dayOrNull(value.lastDay)) throw new Error('Invalid schedule');
  if (value.lastOutcome !== null && value.lastOutcome !== 'pass' && value.lastOutcome !== 'miss') throw new Error('Invalid schedule');
  return { step: value.step, dueDay: value.dueDay, lastDay: value.lastDay, lastOutcome: value.lastOutcome };
}

function readSchedules(value: Record<string, unknown>, valid: (key: string) => boolean): Record<string, Schedule> {
  const schedules: Record<string, Schedule> = {};
  for (const [key, schedule] of Object.entries(value)) {
    if (!valid(key)) throw new Error('Invalid schedule');
    schedules[key] = readSchedule(schedule);
  }
  return schedules;
}

function readReviewRecent(value: Record<string, unknown>): Record<string, ('pass' | 'miss')[]> {
  const recent: Record<string, ('pass' | 'miss')[]> = {};
  for (const [key, outcomes] of Object.entries(value)) {
    if (!CHAPTER.test(key) || !Array.isArray(outcomes) || outcomes.length > REVIEW_WINDOW) throw new Error('Invalid review window');
    recent[key] = outcomes.map((outcome) => {
      if (outcome !== 'pass' && outcome !== 'miss') throw new Error('Invalid review window');
      return outcome;
    });
  }
  return recent;
}

function readDailyReview(value: unknown): SaveV4['dailyReview'] {
  if (value === null) return null;
  if (!object(value) || !isDay(value.day) || !Array.isArray(value.itemIds) || value.itemIds.length > DAILY_CAP) throw new Error('Invalid daily review');
  if (!value.itemIds.every((id) => typeof id === 'string' && ID.test(id))) throw new Error('Invalid daily review');
  return { day: value.day, itemIds: [...value.itemIds] as string[] };
}

function readV4(value: Record<string, unknown>): SaveV4 {
  if (!object(value.tickets) || !object(value.lessons) || !object(value.chapters) || !object(value.badges)) throw new Error('Invalid save');
  if (!object(value.readiness) || !object(value.mistakeTotals) || !object(value.reviews) || !object(value.reviewRecent)) throw new Error('Invalid save');
  if (!integer(value.independentRun, 100_000) || !integer(value.longestRun, 100_000) || value.independentRun > value.longestRun) throw new Error('Invalid save');
  if (value.interview !== null || !Array.isArray(value.interviewHistory) || value.interviewHistory.length > 0) throw new Error('Invalid interview');
  const totals = value.mistakeTotals;
  const reviews = value.reviews;
  if (!object(totals.tags) || !object(totals.competencies) || !object(reviews.tags) || !object(reviews.items)) throw new Error('Invalid save');
  return {
    version: 4,
    activeTicket: readActive(value.activeTicket),
    tickets: readTickets(value.tickets),
    lessons: readLessons(value.lessons),
    chapters: readChapters(value.chapters),
    streak: readStreak(value.streak),
    independentRun: value.independentRun,
    longestRun: value.longestRun,
    badges: readBadges(value.badges),
    readiness: readReadiness(value.readiness),
    mistakeLog: readMistakeLog(value.mistakeLog),
    mistakeTotals: {
      tags: readCounts(totals.tags, (key) => TAGS.includes(key)),
      competencies: readCounts(totals.competencies, (key) => CHAPTER.test(key)),
    },
    reviews: {
      tags: readSchedules(reviews.tags, (key) => TAGS.includes(key)),
      items: readSchedules(reviews.items, (key) => ID.test(key)),
    },
    reviewRecent: readReviewRecent(value.reviewRecent),
    dailyReview: readDailyReview(value.dailyReview),
    interview: null,
    interviewHistory: [],
  };
}

// Reads any save this app can open. Versions 0 to 3 are migrated in memory and rewritten as version 4 on the next change.
// A save from a newer version is never overwritten. An unreadable save is preserved and the session runs without saving.
export function restoreSave(raw: string | null, items: readonly ItemMeta[]): RestoredSave {
  if (raw === null) return { save: emptySave(), status: 'fresh', writable: true };
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value)) throw new Error('Invalid save');
    if (typeof value.version === 'number' && value.version > 4) return { save: emptySave(), status: 'future', writable: false };
    if (value.version === 4) return { save: readV4(value), status: 'restored', writable: true };
    if (value.version === 3) return { save: migrateV3ToV4(readV3(value), items), status: 'migrated', writable: true };
    return { save: migrateV2ToV4(readLegacy(value), items), status: 'migrated', writable: true };
  } catch {
    return { save: emptySave(), status: 'corrupt', writable: false };
  }
}
