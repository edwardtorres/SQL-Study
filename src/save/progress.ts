export const SAVE_KEY = 'juniper-sql-desk.progress';
export interface TicketProgress {
  draft: string;
  attempts: number;
  failures: number;
  passed: boolean;
  hintTier: number;
  solutionRevealed: boolean;
  xp: number;
}
export interface SaveV1 {
  version: 1;
  activeTicket: string | null;
  tickets: Record<string, TicketProgress>;
}
export interface RestoredSave {
  save: SaveV1;
  status: 'fresh' | 'restored' | 'migrated' | 'corrupt' | 'future';
  writable: boolean;
}
export const emptySave = (): SaveV1 => ({ version: 1, activeTicket: null, tickets: {} });
export const emptyProgress = (draft = ''): TicketProgress => ({
  draft, attempts: 0, failures: 0, passed: false, hintTier: 0, solutionRevealed: false, xp: 0,
});
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
const validTicket = (value: unknown): value is TicketProgress => object(value)
  && typeof value.draft === 'string' && value.draft.length <= 20_000
  && integer(value.attempts, 1_000_000) && integer(value.failures, 1_000_000)
  && value.failures <= value.attempts && typeof value.passed === 'boolean'
  && integer(value.hintTier, 3) && typeof value.solutionRevealed === 'boolean' && integer(value.xp, 100);
export function restoreSave(raw: string | null): RestoredSave {
  if (raw === null) return { save: emptySave(), status: 'fresh', writable: true };
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value)) throw new Error('Invalid save');
    if (typeof value.version === 'number' && value.version > 1) return { save: emptySave(), status: 'future', writable: false };
    if (value.version === 0 && object(value.drafts)) {
      const tickets: Record<string, TicketProgress> = {};
      for (const [id, draft] of Object.entries(value.drafts)) {
        if (!/^[a-z][a-z0-9-]{0,63}$/.test(id) || typeof draft !== 'string' || draft.length > 20_000) throw new Error('Invalid old save');
        tickets[id] = emptyProgress(draft);
      }
      return { save: { version: 1, activeTicket: null, tickets }, status: 'migrated', writable: true };
    }
    if (value.version !== 1 || !(value.activeTicket === null || (typeof value.activeTicket === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value.activeTicket))) || !object(value.tickets)) throw new Error('Invalid save');
    const tickets: Record<string, TicketProgress> = {};
    for (const [id, ticket] of Object.entries(value.tickets)) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(id) || !validTicket(ticket)) throw new Error('Invalid ticket');
      tickets[id] = { ...ticket };
    }
    return { save: { version: 1, activeTicket: value.activeTicket, tickets }, status: 'restored', writable: true };
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
