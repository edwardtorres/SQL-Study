import type { ItemMeta } from '../data/itemIndex';
import { awardFor, CREDIT, isScored, kindOf, outcomeOf, READINESS_WINDOW, settle, type Kind } from '../game/rules';
import {
  emptyProgress, emptySave, type InterviewProblem, type InterviewProblemV4, type InterviewResult, type InterviewResultV4, type InterviewSet,
  type InterviewSetV4, type LessonProgress, type SaveV3, type SaveV4, type SaveV5, type ScoredAttempt, type TicketProgress,
} from './format';
import { ID, integer, object, readActive, readLessons } from './validate';

// Versions 0 to 2 are read here and upgraded in memory. Their tickets carry the version 2 fields.
export interface LegacyTicket { draft: string; attempts: number; failures: number; passed: boolean; hintTier: number; solutionRevealed: boolean; xp: number }
export interface SaveV2 { version: 2; activeTicket: string | null; tickets: Record<string, LegacyTicket>; lessons: Record<string, LessonProgress> }

const validDraft = (value: unknown): value is string => typeof value === 'string' && value.length <= 20_000;

function readLegacyTicket(value: unknown): LegacyTicket {
  if (!object(value) || !validDraft(value.draft) || typeof value.passed !== 'boolean' || typeof value.solutionRevealed !== 'boolean') throw new Error('Invalid ticket');
  if (!integer(value.attempts, 1_000_000) || !integer(value.failures, 1_000_000) || value.failures > value.attempts) throw new Error('Invalid ticket');
  if (!integer(value.hintTier, 3) || !integer(value.xp, 100)) throw new Error('Invalid ticket');
  return { draft: value.draft, attempts: value.attempts, failures: value.failures, passed: value.passed, hintTier: value.hintTier, solutionRevealed: value.solutionRevealed, xp: value.xp };
}

function readLegacyTickets(value: Record<string, unknown>): Record<string, LegacyTicket> {
  const tickets: Record<string, LegacyTicket> = {};
  for (const [id, ticket] of Object.entries(value)) {
    if (!ID.test(id)) throw new Error('Invalid ticket');
    tickets[id] = readLegacyTicket(ticket);
  }
  return tickets;
}

// Reads a version 0, 1 or 2 save into the version 2 shape. Anything else throws.
export function readLegacy(value: Record<string, unknown>): SaveV2 {
  if (value.version === 0 && object(value.drafts)) {
    const tickets: Record<string, LegacyTicket> = {};
    for (const [id, draft] of Object.entries(value.drafts)) {
      if (!ID.test(id) || !validDraft(draft)) throw new Error('Invalid old save');
      tickets[id] = { draft, attempts: 0, failures: 0, passed: false, hintTier: 0, solutionRevealed: false, xp: 0 };
    }
    return { version: 2, activeTicket: null, tickets, lessons: {} };
  }
  if (value.version === 1 && object(value.tickets)) {
    return { version: 2, activeTicket: readActive(value.activeTicket), tickets: readLegacyTickets(value.tickets), lessons: {} };
  }
  if (value.version === 2 && object(value.tickets) && object(value.lessons)) {
    return { version: 2, activeTicket: readActive(value.activeTicket), tickets: readLegacyTickets(value.tickets), lessons: readLessons(value.lessons) };
  }
  throw new Error('Invalid save');
}

// Version 2 kept only final flags, so the migration is conservative. A pass after a reveal is treated as voided, and no time is invented.
// Passes and reveals carry time 0. A reveal at time 0 voids a boss pass at time 0, so every revealed boss part must be passed again.
function migrateTicket(ticket: LegacyTicket, kind: Kind): TicketProgress {
  const revealedAt = ticket.solutionRevealed ? 0 : null;
  const base = { ...emptyProgress(ticket.draft), attempts: ticket.attempts, failures: ticket.failures, hintTier: ticket.hintTier, solutionRevealed: ticket.solutionRevealed, revealedAt };
  if (!ticket.passed) return base;
  const outcome = outcomeOf(ticket);
  return { ...base, passed: true, xp: awardFor(kind, outcome, ticket.hintTier), firstOutcome: outcome, firstPassAt: 0, passedAt: 0 };
}

// The readiness window is seeded from the stored first passes, most recent last, as readiness was computed before version 4.
// Ties keep the same order the old derivation used, so migrated scores do not move.
function seedReadiness<T extends Pick<SaveV5, 'tickets' | 'readiness'>>(save: T, items: readonly ItemMeta[]): T {
  const firsts = items
    .filter(isScored)
    .flatMap((item) => {
      const ticket = save.tickets[item.id];
      return ticket?.firstOutcome && ticket.firstPassAt !== null ? [{ chapter: item.chapterId, at: ticket.firstPassAt, credit: CREDIT[ticket.firstOutcome] }] : [];
    })
    .sort((a, b) => b.at - a.at);
  const readiness: Record<string, ScoredAttempt[]> = {};
  for (const { chapter, at, credit } of firsts) {
    const key = String(chapter);
    const kept = readiness[key] ?? [];
    if (kept.length < READINESS_WINDOW) readiness[key] = [...kept, { at, credit }];
  }
  for (const key of Object.keys(readiness)) readiness[key] = readiness[key]!.reverse();
  return { ...save, readiness };
}

// Version 2 to version 5. Mastery, badges and the desk state follow from the migrated tickets. Streaks and runs start at zero,
// because version 2 kept no history. The mistake log starts empty, because version 2 kept no mistake tags. Version 2 has no interview.
export function migrateV2ToV5(legacy: SaveV2, items: readonly ItemMeta[]): SaveV5 {
  const kinds = new Map(items.map((item) => [item.id, kindOf(item)]));
  const tickets: Record<string, TicketProgress> = {};
  for (const [id, ticket] of Object.entries(legacy.tickets)) tickets[id] = migrateTicket(ticket, kinds.get(id) ?? 'independent');
  const settled = settle(items, { ...emptySave(), activeTicket: legacy.activeTicket, tickets, lessons: legacy.lessons }, 0);
  return seedReadiness(settled, items);
}

// Version 3 to version 4. Every version 3 field carries over; the new fields start empty, and the readiness window is seeded
// from the version 3 first passes, which carry real times. Version 3 kept no mistake tags, so the mistake log starts empty.
export function migrateV3ToV4(save: SaveV3, items: readonly ItemMeta[]): SaveV4 {
  const migrated: SaveV4 = {
    ...emptySave(), version: 4, interview: null, interviewHistory: [],
    activeTicket: save.activeTicket, tickets: save.tickets, lessons: save.lessons, chapters: save.chapters, streak: save.streak,
    independentRun: save.independentRun, longestRun: save.longestRun, badges: save.badges,
  };
  return seedReadiness(migrated, items);
}

// Version 4 to version 5. Version 4 recorded no time per interview problem, so a migrated problem has no time spent, no open
// workspace and no estimate. A missing estimate is what marks a migrated result's time as not recorded.
const migrateProblem = (problem: InterviewProblemV4): InterviewProblem => ({ ...problem, spentMs: 0, openedAt: null, estimateMinutes: null });
const migrateSet = (set: InterviewSetV4): InterviewSet => ({ ...set, problems: set.problems.map(migrateProblem) });
const migrateResult = (result: InterviewResultV4): InterviewResult => ({ ...result, problems: result.problems.map(migrateProblem) });

export function migrateV4ToV5(save: SaveV4): SaveV5 {
  return {
    ...save,
    version: 5,
    interview: save.interview === null ? null : migrateSet(save.interview),
    interviewHistory: save.interviewHistory.map(migrateResult),
  };
}
