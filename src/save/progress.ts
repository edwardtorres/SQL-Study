export const SAVE_KEY = 'larkspur-sql-desk.progress';
export interface TicketProgress {
  draft: string;
  attempts: number;
  failures: number;
  passed: boolean;
  hintTier: number;
  solutionRevealed: boolean;
  xp: number;
}
// Version 2 adds per-section lesson progress. Ticket progress is keyed by item id, as in version 1.
export interface LessonProgress { read: boolean; answer: string | null; correct: boolean }
export interface SaveV1 {
  version: 1;
  activeTicket: string | null;
  tickets: Record<string, TicketProgress>;
}
export interface SaveV2 {
  version: 2;
  activeTicket: string | null;
  tickets: Record<string, TicketProgress>;
  lessons: Record<string, LessonProgress>;
}
export interface RestoredSave {
  save: SaveV2;
  status: 'fresh' | 'restored' | 'migrated' | 'corrupt' | 'future';
  writable: boolean;
}
const ID = /^[a-z][a-z0-9-]{0,63}$/;
export const emptySave = (): SaveV2 => ({ version: 2, activeTicket: null, tickets: {}, lessons: {} });
export const emptyProgress = (draft = ''): TicketProgress => ({
  draft, attempts: 0, failures: 0, passed: false, hintTier: 0, solutionRevealed: false, xp: 0,
});
export const emptyLesson = (): LessonProgress => ({ read: false, answer: null, correct: false });
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
const validTicket = (value: unknown): value is TicketProgress => object(value)
  && typeof value.draft === 'string' && value.draft.length <= 20_000
  && integer(value.attempts, 1_000_000) && integer(value.failures, 1_000_000)
  && value.failures <= value.attempts && typeof value.passed === 'boolean'
  && integer(value.hintTier, 3) && typeof value.solutionRevealed === 'boolean' && integer(value.xp, 100);
const validLesson = (value: unknown): value is LessonProgress => object(value)
  && typeof value.read === 'boolean' && typeof value.correct === 'boolean'
  && (value.answer === null || (typeof value.answer === 'string' && /^[a-z]{1,4}$/.test(value.answer)));
function readTickets(raw: Record<string, unknown>): Record<string, TicketProgress> {
  const tickets: Record<string, TicketProgress> = {};
  for (const [id, ticket] of Object.entries(raw)) {
    if (!ID.test(id) || !validTicket(ticket)) throw new Error('Invalid ticket');
    tickets[id] = { ...ticket };
  }
  return tickets;
}
function readActive(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && ID.test(value)) return value;
  throw new Error('Invalid active ticket');
}
// Version 1 saves are upgraded in memory: their tickets carry over, and no lesson progress is invented.
export function migrateV1(value: SaveV1): SaveV2 {
  return { version: 2, activeTicket: value.activeTicket, tickets: value.tickets, lessons: {} };
}
export function restoreSave(raw: string | null): RestoredSave {
  if (raw === null) return { save: emptySave(), status: 'fresh', writable: true };
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value)) throw new Error('Invalid save');
    if (typeof value.version === 'number' && value.version > 2) return { save: emptySave(), status: 'future', writable: false };
    if (value.version === 0 && object(value.drafts)) {
      const tickets: Record<string, TicketProgress> = {};
      for (const [id, draft] of Object.entries(value.drafts)) {
        if (!ID.test(id) || typeof draft !== 'string' || draft.length > 20_000) throw new Error('Invalid old save');
        tickets[id] = emptyProgress(draft);
      }
      return { save: { version: 2, activeTicket: null, tickets, lessons: {} }, status: 'migrated', writable: true };
    }
    if (value.version === 1 && object(value.tickets)) {
      const save = migrateV1({ version: 1, activeTicket: readActive(value.activeTicket), tickets: readTickets(value.tickets) });
      return { save, status: 'migrated', writable: true };
    }
    if (value.version !== 2 || !object(value.tickets) || !object(value.lessons)) throw new Error('Invalid save');
    const lessons: Record<string, LessonProgress> = {};
    for (const [id, lesson] of Object.entries(value.lessons)) {
      if (!ID.test(id) || !validLesson(lesson)) throw new Error('Invalid lesson');
      lessons[id] = { ...lesson };
    }
    return { save: { version: 2, activeTicket: readActive(value.activeTicket), tickets: readTickets(value.tickets), lessons }, status: 'restored', writable: true };
  } catch {
    // Preserve the unreadable original. UI can continue in memory without overwriting it.
    return { save: emptySave(), status: 'corrupt', writable: false };
  }
}
export function rewardFor(progress: Pick<TicketProgress, 'hintTier' | 'solutionRevealed'>): number {
  return Math.max(0, (progress.solutionRevealed ? 25 : 100) - progress.hintTier * 10);
}
export function recordGrade(progress: TicketProgress, passed: boolean): TicketProgress {
  return {
    ...progress,
    attempts: progress.attempts + 1,
    failures: progress.failures + (passed ? 0 : 1),
    passed: progress.passed || passed,
    xp: passed ? Math.max(progress.xp, rewardFor(progress)) : progress.xp,
  };
}
export function useHint(progress: TicketProgress): TicketProgress {
  const hintTier = Math.min(3, progress.hintTier + 1);
  return { ...progress, hintTier, xp: progress.passed ? Math.max(0, progress.xp - (hintTier - progress.hintTier) * 10) : progress.xp };
}
// After three failed attempts the solution is unlocked; the learner may also request it earlier. Either way it costs reduced XP.
export function solutionUnlocked(progress: Pick<TicketProgress, 'failures'>): boolean {
  return progress.failures >= 3;
}
// Revealing never removes XP already earned; it lowers the reward for the next pass.
export function revealSolution(progress: TicketProgress): TicketProgress {
  return { ...progress, solutionRevealed: true };
}
