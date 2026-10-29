import type { SaveV6 } from './format';

// The export reminder. It shows when the save holds progress, nothing has been exported for a week, and it is not snoozed.
// Pure functions: the page passes in the clock.
export const BACKUP_WEEK_MS = 7 * 24 * 60 * 60_000;
export const BACKUP_SNOOZE_MS = 24 * 60 * 60_000;

// Progress worth keeping: at least one passed ticket.
export const hasProgress = (save: SaveV6): boolean => Object.values(save.tickets).some((ticket) => ticket.passed);

// An upgraded or new save has no creation time until the page first loads it. Until then the reminder stays quiet.
export const backupDue = (save: SaveV6, now: number): boolean => {
  const { createdAt, lastExportAt, reminderSnoozedUntil } = save.backup;
  if (createdAt === 0 || !hasProgress(save)) return false;
  if (reminderSnoozedUntil !== null && now < reminderSnoozedUntil) return false;
  return now - (lastExportAt ?? createdAt) >= BACKUP_WEEK_MS;
};

export const anchoredBackup = (save: SaveV6, now: number): SaveV6 =>
  save.backup.createdAt === 0 ? { ...save, backup: { ...save.backup, createdAt: now } } : save;

export const exportedBackup = (save: SaveV6, now: number): SaveV6 =>
  ({ ...save, backup: { ...save.backup, lastExportAt: now, reminderSnoozedUntil: null } });

export const snoozedBackup = (save: SaveV6, now: number): SaveV6 =>
  ({ ...save, backup: { ...save.backup, reminderSnoozedUntil: now + BACKUP_SNOOZE_MS } });
