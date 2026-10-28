import type { ItemMeta } from '../data/itemIndex';
import { awardFor, kindOf, outcomeOf, settle, type Kind } from '../game/rules';
import { emptyProgress, emptySave, type LessonProgress, type SaveV3, type TicketProgress } from './format';
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

// Mastery, badges and the desk state follow from the migrated tickets. Streaks and runs start at zero, because version 2 kept no history.
export function migrateToV3(legacy: SaveV2, items: readonly ItemMeta[]): SaveV3 {
  const kinds = new Map(items.map((item) => [item.id, kindOf(item)]));
  const tickets: Record<string, TicketProgress> = {};
  for (const [id, ticket] of Object.entries(legacy.tickets)) tickets[id] = migrateTicket(ticket, kinds.get(id) ?? 'independent');
  return settle(items, { ...emptySave(), activeTicket: legacy.activeTicket, tickets, lessons: legacy.lessons }, 0);
}
