import { describe, expect, test } from 'vitest';
import { emptyProgress, emptySave, recordGrade, restoreSave, revealSolution, rewardFor, solutionUnlocked, useHint } from '../src/save/progress';

describe('versioned progress', () => {
  test('first use starts a version 2 save', () => {
    expect(restoreSave(null)).toEqual({ save: emptySave(), status: 'fresh', writable: true });
  });
  test('round trips drafts, passes, hints, revealed solutions and lesson progress', () => {
    const ticket = { ...recordGrade(emptyProgress('SELECT 1;'), true), hintTier: 2, solutionRevealed: true };
    const save = { version: 2, activeTicket: 'c5-g1', tickets: { 'c5-g1': ticket }, lessons: { 'c5-s1': { read: true, answer: 'b', correct: true } } };
    expect(restoreSave(JSON.stringify(save))).toEqual({ save, status: 'restored', writable: true });
  });
  test('migrates a version 1 save, keeping tickets and inventing no lesson progress', () => {
    const ticket = recordGrade(emptyProgress('SELECT id FROM shipments;'), true);
    const result = restoreSave(JSON.stringify({ version: 1, activeTicket: 'dispatch', tickets: { dispatch: ticket } }));
    expect(result).toEqual({ save: { version: 2, activeTicket: 'dispatch', tickets: { dispatch: ticket }, lessons: {} }, status: 'migrated', writable: true });
  });
  test('migrates v0 drafts without inventing completions', () => {
    const result = restoreSave(JSON.stringify({ version: 0, drafts: { dispatch: 'SELECT 1' } }));
    expect(result.status).toBe('migrated');
    expect(result.save.tickets.dispatch).toEqual(emptyProgress('SELECT 1'));
    expect(result.save.lessons).toEqual({});
  });
  test.each([
    '{',
    'null',
    JSON.stringify({ version: 2, tickets: {}, lessons: {}, activeTicket: 3 }),
    JSON.stringify({ version: 2, activeTicket: null, tickets: { dispatch: { ...emptyProgress(), hintTier: 99 } }, lessons: {} }),
    JSON.stringify({ version: 2, activeTicket: null, tickets: {}, lessons: { 'c5-s1': { read: true, answer: 'Bad Answer', correct: false } } }),
    JSON.stringify({ version: 1, tickets: {}, activeTicket: 3 }),
  ])('preserves corrupt save instead of overwriting: %s', (raw) => {
    expect(restoreSave(raw)).toMatchObject({ status: 'corrupt', writable: false });
  });
  test('does not overwrite future versions', () => {
    expect(restoreSave('{"version":3,"tickets":{}}')).toMatchObject({ status: 'future', writable: false });
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
  test('solutions unlock after three failures and revealing keeps earned XP', () => {
    let progress = emptyProgress();
    for (let attempt = 0; attempt < 3; attempt += 1) progress = recordGrade(progress, false);
    expect(solutionUnlocked(progress)).toBe(true);
    const earned = recordGrade(emptyProgress(), true);
    expect(revealSolution(earned)).toMatchObject({ solutionRevealed: true, xp: earned.xp });
  });
});
