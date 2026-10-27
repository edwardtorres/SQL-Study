import { describe, expect, test } from 'vitest';
import { emptyProgress, emptySave, recordGrade, restoreSave, rewardFor, useHint } from '../src/save/progress';
describe('versioned progress', () => {
  test('first use starts a version1 save', () => {
    expect(restoreSave(null)).toEqual({ save: emptySave(), status: 'fresh', writable: true });
  });
  test('round trips draft, attempts, passes, hints and revealed solution', () => {
    const ticket = { ...recordGrade(emptyProgress('SELECT 1;'), true), hintTier: 2, solutionRevealed: true };
    const save = { version: 1, activeTicket: 'dispatch', tickets: { dispatch: ticket } };
    expect(restoreSave(JSON.stringify(save)).save).toEqual(save);
  });
  test('migrates v0 drafts without inventing completions', () => {
    const result = restoreSave(JSON.stringify({ version: 0, drafts: { dispatch: 'SELECT 1' } }));
    expect(result.status).toBe('migrated');
    expect(result.save.tickets.dispatch).toEqual(emptyProgress('SELECT 1'));
  });
  test.each(['{', 'null', JSON.stringify({ version: 1, tickets: {}, activeTicket: 3 }), JSON.stringify({ version: 1, activeTicket: null, tickets: { dispatch: { ...emptyProgress(), hintTier: 99 } } })])('preserves corrupt save instead of overwriting: %s', (raw) => {
    expect(restoreSave(raw)).toMatchObject({ status: 'corrupt', writable: false });
  });
  test('does not overwrite future versions', () => {
    expect(restoreSave('{"version":2,"tickets":{}}')).toMatchObject({ status: 'future', writable: false });
  });
  test('hints remain available at zero XP and cost the eventual reward', () => {
    const progress = useHint(emptyProgress());
    expect(progress.hintTier).toBe(1);
    expect(rewardFor(progress)).toBe(90);
    expect(recordGrade(progress, true).xp).toBe(90);
  });
  test('reveal reduces rewards, failures do not earn XP, reruns cannot farm XP', () => {
    expect(recordGrade(emptyProgress(), false)).toMatchObject({ attempts: 1, failures: 1, xp: 0, passed: false });
    const passed = recordGrade({ ...emptyProgress(), solutionRevealed: true }, true);
    expect(passed.xp).toBe(25);
    expect(recordGrade(passed, true).xp).toBe(25);
    expect(recordGrade(passed, false).passed).toBe(true);
  });
});
