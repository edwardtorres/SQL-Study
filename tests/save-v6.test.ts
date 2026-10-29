import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { anchoredBackup, backupDue, BACKUP_SNOOZE_MS, BACKUP_WEEK_MS, exportedBackup, hasProgress, snoozedBackup } from '../src/save/backup';
import { emptyProgress, emptySave, type SaveV6 } from '../src/save/format';
import { restoreSave } from '../src/save/progress';

const T0 = Date.parse('2026-03-02T12:00:00Z');
const DAY = 24 * 60 * 60_000;

// A save with one passed ticket, anchored at T0.
const withProgress = (createdAt = T0): SaveV6 => ({
  ...emptySave(),
  tickets: { dispatch: { ...emptyProgress(), passed: true, passedAt: T0, firstOutcome: 'first-try', firstPassAt: T0, xp: 25 } },
  backup: { createdAt, lastExportAt: null, reminderSnoozedUntil: null },
});

describe('the backup reminder', () => {
  test('a save with no passed ticket has nothing to lose, so no reminder', () => {
    expect(hasProgress(emptySave())).toBe(false);
    expect(backupDue({ ...emptySave(), backup: { createdAt: T0, lastExportAt: null, reminderSnoozedUntil: null } }, T0 + 30 * DAY)).toBe(false);
  });

  test('an unanchored save stays quiet until the page has anchored it', () => {
    expect(backupDue(withProgress(0), T0 + 30 * DAY)).toBe(false);
  });

  test('a week after the save began, with progress, the reminder shows', () => {
    expect(backupDue(withProgress(), T0 + BACKUP_WEEK_MS - 1)).toBe(false);
    expect(backupDue(withProgress(), T0 + BACKUP_WEEK_MS)).toBe(true);
  });

  test('an export starts the week again', () => {
    const exported = exportedBackup(withProgress(), T0 + 8 * DAY);
    expect(backupDue(exported, T0 + 8 * DAY + BACKUP_WEEK_MS - 1)).toBe(false);
    expect(backupDue(exported, T0 + 8 * DAY + BACKUP_WEEK_MS)).toBe(true);
  });

  test('Later hides the reminder for 24 hours, then it can show again', () => {
    const snoozed = snoozedBackup(withProgress(), T0 + 8 * DAY);
    expect(snoozed.backup.reminderSnoozedUntil).toBe(T0 + 8 * DAY + BACKUP_SNOOZE_MS);
    expect(backupDue(snoozed, T0 + 8 * DAY + BACKUP_SNOOZE_MS - 1)).toBe(false);
    expect(backupDue(snoozed, T0 + 8 * DAY + BACKUP_SNOOZE_MS)).toBe(true);
  });

  test('an export clears a snooze', () => {
    const exported = exportedBackup(snoozedBackup(withProgress(), T0 + 8 * DAY), T0 + 8 * DAY + 1);
    expect(exported.backup.reminderSnoozedUntil).toBeNull();
  });

  test('anchoring sets the creation time once, and keeps an existing one', () => {
    expect(anchoredBackup(withProgress(0), T0).backup.createdAt).toBe(T0);
    expect(anchoredBackup(withProgress(T0 - DAY), T0).backup.createdAt).toBe(T0 - DAY);
  });
});

describe('version 5 to version 6 migration and version 6 validation', () => {
  test('a version 5 save migrates with an unanchored backup record', () => {
    const { backup: _backup, ...v5 } = { ...emptySave(), version: 5 };
    const result = restoreSave(JSON.stringify(v5), itemIndex);
    expect(result).toMatchObject({ status: 'migrated', writable: true });
    expect(result.save.backup).toEqual({ createdAt: 0, lastExportAt: null, reminderSnoozedUntil: null });
  });

  test('a version 6 save round trips its backup record', () => {
    const save = withProgress(T0);
    const exported = exportedBackup(save, T0 + DAY);
    expect(restoreSave(JSON.stringify(exported), itemIndex)).toEqual({ save: exported, status: 'restored', writable: true });
  });

  test('a backup record with a bad time is corrupt', () => {
    const bad = { ...withProgress(T0), backup: { createdAt: -1, lastExportAt: null, reminderSnoozedUntil: null } };
    expect(restoreSave(JSON.stringify(bad), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
    const missing = { ...withProgress(T0), backup: undefined };
    expect(restoreSave(JSON.stringify(missing), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
  });
});
