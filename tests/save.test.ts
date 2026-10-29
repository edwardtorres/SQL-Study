import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { applySubmission, localDay } from '../src/game/rules';
import { emptyProgress, emptySave, restoreSave, type SaveV5 } from '../src/save/progress';

const REFERENCE = 'SELECT reference FROM shipments';
const item = (id: string) => itemIndex.find((candidate) => candidate.id === id)!;

describe('versioned progress', () => {
  test('first use starts a version 5 save', () => {
    expect(restoreSave(null, itemIndex)).toEqual({ save: emptySave(), status: 'fresh', writable: true });
  });

  test('round trips drafts, passes, hints, reveals, lessons, chapters, streaks and badges', () => {
    const at = Date.parse('2026-03-02T12:00:00Z');
    const graded = applySubmission(emptySave(), itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'SELECT 1', at, day: localDay(at, 'UTC') });
    const save: SaveV5 = {
      ...graded.save,
      activeTicket: 'c1-i1',
      lessons: { 'c1-s1': { read: true, answer: 'a', correct: true } },
      chapters: { '1': { method: 'test-out', masteredAt: at } },
      badges: { 'boss-first-try': at, 'rank-junior-analyst': at },
    };
    save.tickets['c1-i2'] = { ...emptyProgress('SELECT 2;'), hintTier: 2, solutionRevealed: true, revealedAt: at };
    expect(restoreSave(JSON.stringify(save), itemIndex)).toEqual({ save, status: 'restored', writable: true });
  });

  test('migrates a version 1 save, keeping its passes and inventing no lesson progress', () => {
    const result = restoreSave(JSON.stringify({ version: 1, activeTicket: 'dispatch', tickets: { dispatch: { draft: 'SELECT id FROM shipments LIMIT 1;', attempts: 1, failures: 0, passed: true, hintTier: 0, solutionRevealed: false, xp: 100 } } }), itemIndex);
    expect(result).toMatchObject({ status: 'migrated', writable: true });
    expect(result.save.version).toBe(5);
    expect(result.save.lessons).toEqual({});
    // The sample ticket earns the independent award: 25 base plus the 10 first-try bonus.
    expect(result.save.tickets.dispatch).toMatchObject({ passed: true, xp: 35, firstOutcome: 'first-try', firstPassAt: 0, passedAt: 0 });
  });

  test('migrates version 0 drafts without inventing completions', () => {
    const result = restoreSave(JSON.stringify({ version: 0, drafts: { dispatch: 'SELECT 1' } }), itemIndex);
    expect(result.status).toBe('migrated');
    expect(result.save.tickets.dispatch).toEqual(emptyProgress('SELECT 1'));
    expect(result.save.lessons).toEqual({});
    expect(result.save.chapters).toEqual({});
  });

  test.each([
    '{',
    'null',
    JSON.stringify({ version: 2, tickets: {}, lessons: {}, activeTicket: 3 }),
    JSON.stringify({ version: 2, activeTicket: null, tickets: { dispatch: { draft: '', attempts: 0, failures: 0, passed: false, hintTier: 99, solutionRevealed: false, xp: 0 } }, lessons: {} }),
    JSON.stringify({ version: 2, activeTicket: null, tickets: {}, lessons: { 'c5-s1': { read: true, answer: 'Bad Answer', correct: false } } }),
    JSON.stringify({ version: 1, tickets: {}, activeTicket: 3 }),
  ])('preserves a corrupt save instead of overwriting it: %s', (raw) => {
    expect(restoreSave(raw, itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
  });

  test('does not overwrite a save from a newer version', () => {
    expect(restoreSave('{"version":6,"tickets":{}}', itemIndex)).toMatchObject({ status: 'future', writable: false });
  });
});
