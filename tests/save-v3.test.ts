import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { applySubmission, localDay, totalXp } from '../src/game/rules';
import { emptySave, restoreSave, type SaveV6 } from '../src/save/progress';

// The fixture is a real version 2 save from the Step 3b build, captured in Chromium by driving its UI: two guided passes,
// one wrong query, one hint, one reveal, and one correct lesson prediction.
const v2Text = readFileSync(new URL('./fixtures/save-v2.json', import.meta.url), 'utf8');
const migrated = (): SaveV6 => {
  const result = restoreSave(v2Text, itemIndex);
  expect(result.status).toBe('migrated');
  return result.save;
};

describe('version 2 to version 3 migration, on the captured fixture', () => {
  test('a first-try guided pass keeps its pass and earns the guided award with the first-try bonus', () => {
    expect(migrated().tickets['c1-g1']).toMatchObject({ passed: true, firstOutcome: 'first-try', xp: 15, firstPassAt: 0, passedAt: 0, revealedAt: null });
  });

  test('a pass after a failure and a hint is hinted, and its award is the base minus 5 per hint', () => {
    expect(migrated().tickets['c1-g2']).toMatchObject({ passed: true, firstOutcome: 'hinted', xp: 5, failures: 1, hintTier: 1 });
  });

  test('a pass after a reveal is revealed, and earns the flat reveal award', () => {
    expect(migrated().tickets['c1-g3']).toMatchObject({ passed: true, firstOutcome: 'revealed', xp: 5, revealedAt: 0, passedAt: 0, solutionRevealed: true });
  });

  test('an unpassed ticket keeps its draft and failures and earns nothing', () => {
    expect(migrated().tickets['c1-g4']).toMatchObject({ passed: false, firstOutcome: null, xp: 0, failures: 1, firstPassAt: null, passedAt: null });
    expect(migrated().tickets['c1-g4']!.draft).toBe('SELECT tracking_code FROM shipments;');
  });

  test('lessons, the active ticket and the draft are kept, and no history is invented', () => {
    const save = migrated();
    expect(save.lessons).toEqual({ 'c1-s1': { read: true, answer: 'a', correct: true } });
    expect(save.activeTicket).toBe('c1-g4');
    expect(save.streak).toEqual({ current: 0, longest: 0, countedDay: null, itemsDay: null, items: [] });
    expect([save.independentRun, save.longestRun]).toEqual([0, 0]);
  });

  test('XP is recalculated under the new table, so the 215 XP the old build showed is now 25', () => {
    expect(totalXp(migrated())).toBe(25);
  });

  test('no chapter is mastered by the fixture, so chapter 2 stays locked', () => {
    const save = migrated();
    expect(save.chapters).toEqual({});
    expect(save.badges).toEqual({});
  });
});

describe('version 2 boss tickets under the new reveal rule', () => {
  const v2Boss = (revealFirstPart: boolean): string => JSON.stringify({
    version: 2,
    activeTicket: null,
    lessons: {},
    tickets: Object.fromEntries(['c1-b1-p1', 'c1-b1-p2', 'c1-b1-p3'].map((id, index) => [id, {
      draft: '', attempts: 1, failures: 0, passed: true, hintTier: 0, solutionRevealed: revealFirstPart && index === 0, xp: 100,
    }])),
  });

  test('an unrevealed boss passed first try is mastered by test-out, and earns the first-try boss badge', () => {
    const save = restoreSave(v2Boss(false), itemIndex).save;
    expect(save.chapters['1']).toEqual({ method: 'test-out', masteredAt: 0 });
    expect(save.badges['boss-first-try']).toBe(0);
  });

  test('a revealed boss part is voided, so the chapter is not mastered until that part passes again', () => {
    const save = restoreSave(v2Boss(true), itemIndex).save;
    expect(save.chapters['1']).toBeUndefined();
    expect(save.tickets['c1-b1-p1']).toMatchObject({ revealedAt: 0, passedAt: 0 });
  });

  test('after the migration, a different query passes the revealed part again and completes the boss', () => {
    const save = restoreSave(v2Boss(true), itemIndex).save;
    const at = Date.parse('2026-03-02T12:00:00Z');
    const again = applySubmission(save, itemIndex, itemIndex.find((candidate) => candidate.id === 'c1-b1-p1')!, 'SELECT reference FROM shipments', {
      passed: true, sql: 'SELECT other FROM shipments', at, day: localDay(at, 'UTC'),
    });
    expect(again.save.chapters['1']).toMatchObject({ method: 'test-out', masteredAt: at });
  });
});

describe('version 3 consistency', () => {
  const v3 = (): SaveV6 => JSON.parse(JSON.stringify(emptySave())) as SaveV6;
  const cases: [string, (save: Record<string, unknown>) => void][] = [
    ['a pass without a first outcome', (save) => { save.tickets = { 'c1-i1': { draft: '', attempts: 1, failures: 0, passed: true, hintTier: 0, solutionRevealed: false, xp: 35, firstOutcome: null, firstPassAt: 1, passedAt: 1, revealedAt: null, repeatDay: null } }; }],
    ['a pass time without a pass', (save) => { save.tickets = { 'c1-i1': { draft: '', attempts: 1, failures: 1, passed: false, hintTier: 0, solutionRevealed: false, xp: 0, firstOutcome: null, firstPassAt: null, passedAt: 1, revealedAt: null, repeatDay: null } }; }],
    ['an unknown outcome', (save) => { save.tickets = { 'c1-i1': { draft: '', attempts: 1, failures: 0, passed: true, hintTier: 0, solutionRevealed: false, xp: 35, firstOutcome: 'lucky', firstPassAt: 1, passedAt: 1, revealedAt: null, repeatDay: null } }; }],
    ['a repeat day that is not a date', (save) => { save.tickets = { 'c1-i1': { draft: '', attempts: 1, failures: 0, passed: false, hintTier: 0, solutionRevealed: false, xp: 0, firstOutcome: null, firstPassAt: null, passedAt: null, revealedAt: null, repeatDay: 'Monday' } }; }],
    ['a chapter key outside 1 to 13', (save) => { save.chapters = { '14': { method: 'boss', masteredAt: 1 } }; }],
    ['a streak with items but no day', (save) => { save.streak = { current: 0, longest: 0, countedDay: null, itemsDay: null, items: ['c1-i1'] }; }],
    ['a current streak above the longest', (save) => { save.streak = { current: 3, longest: 2, countedDay: '2026-03-02', itemsDay: null, items: [] }; }],
    ['an independent run above the longest run', (save) => { save.independentRun = 2; save.longestRun = 1; }],
    ['a badge with a negative time', (save) => { save.badges = { 'streak-7': -1 }; }],
  ];
  test.each(cases)('rejects %s as corrupt', (_, mutate) => {
    const save = v3() as unknown as Record<string, unknown>;
    mutate(save);
    expect(restoreSave(JSON.stringify(save), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
  });

  test('an empty version 3 save restores as written', () => {
    expect(restoreSave(JSON.stringify(v3()), itemIndex)).toMatchObject({ status: 'restored', writable: true });
  });
});
