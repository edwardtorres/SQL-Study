import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { readinessOf } from '../src/game/rules';
import { restoreSave, type SaveV6 } from '../src/save/progress';

// The fixture is a real version 3 save from the Step 4 build, captured in Chromium by driving its UI: a lesson answer,
// a first-try guided pass, a hinted pass, a reveal, an unpassed ticket, a three-part chapter 1 boss, and a streak.
const v3Text = readFileSync(new URL('./fixtures/save-v3.json', import.meta.url), 'utf8');
const migrated = (): SaveV6 => {
  const result = restoreSave(v3Text, itemIndex);
  expect(result.status).toBe('migrated');
  return result.save;
};

describe('version 3 to version 4 migration, on the captured fixture', () => {
  test('every version 3 field carries over unchanged', () => {
    const save = migrated();
    expect(save.version).toBe(6);
    expect(save.activeTicket).toBe('c1-b1-p3');
    expect(save.chapters).toEqual({ '1': expect.objectContaining({ method: 'boss' }) });
    expect(save.badges).toHaveProperty('boss-first-try');
    expect(save.streak).toMatchObject({ current: 1, longest: 1 });
    expect(save.lessons).toEqual({ 'c1-s1': { read: true, answer: 'a', correct: true } });
    expect(save.tickets['c1-g2']).toMatchObject({ firstOutcome: 'hinted', xp: 5, failures: 1, hintTier: 1 });
    expect(save.tickets['c1-g3']).toMatchObject({ firstOutcome: 'revealed', xp: 5, solutionRevealed: true });
  });

  test('the new fields start empty, because version 3 kept no mistake tags and no review history', () => {
    const save = migrated();
    expect(save.mistakeLog).toEqual([]);
    expect(save.mistakeTotals).toEqual({ tags: {}, competencies: {} });
    expect(save.reviews).toEqual({ tags: {}, items: {} });
    expect(save.reviewRecent).toEqual({});
    expect(save.dailyReview).toBeNull();
    expect(save.interview).toBeNull();
    expect(save.interviewHistory).toEqual([]);
  });

  test('the readiness window is seeded from the version 3 first passes, so the scores do not move on migration', () => {
    const save = migrated();
    // Chapter 1's scored first passes are the three boss parts, each a first try: three attempts, below the five needed for a score.
    expect(readinessOf(save, 1)).toMatchObject({ scored: 3, score: null, ready: false });
    expect(save.readiness['1']!.map((entry) => entry.credit)).toEqual([1, 1, 1]);
  });

  test('a migrated save round trips as a version 6 save', () => {
    const save = migrated();
    expect(restoreSave(JSON.stringify(save), itemIndex)).toEqual({ save, status: 'restored', writable: true });
  });
});

describe('version 4 validation', () => {
  const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(migrated()));
  const cases: [string, (save: Record<string, unknown>) => void][] = [
    ['a mistake tag outside the taxonomy', (save) => { save.mistakeLog = [{ at: 1, day: '2026-03-02', itemId: 'c1-i1', competency: 1, tag: 'MADE_UP', kind: 'failed' }]; }],
    ['a mistake kind that is neither failed nor revealed', (save) => { save.mistakeLog = [{ at: 1, day: '2026-03-02', itemId: 'c1-i1', competency: 1, tag: null, kind: 'passed' }]; }],
    ['a mistake log over its cap', (save) => { save.mistakeLog = Array.from({ length: 501 }, () => ({ at: 1, day: '2026-03-02', itemId: 'c1-i1', competency: 1, tag: null, kind: 'revealed' })); }],
    ['a readiness credit that is not one of the weights', (save) => { save.readiness = { '1': [{ at: 1, credit: 0.7 }] }; }],
    ['a readiness window over ten', (save) => { save.readiness = { '1': Array.from({ length: 11 }, (_, index) => ({ at: index, credit: 1 })) }; }],
    ['a review window over five', (save) => { save.reviewRecent = { '1': ['pass', 'pass', 'pass', 'pass', 'pass', 'pass'] }; }],
    ['a review outcome that is not pass or miss', (save) => { save.reviewRecent = { '1': ['maybe'] }; }],
    ['a schedule step past the last interval', (save) => { save.reviews = { tags: {}, items: { 'c1-i1': { step: 6, dueDay: '2026-03-02', lastDay: null, lastOutcome: null } } }; }],
    ['a schedule with a bad due day', (save) => { save.reviews = { tags: {}, items: { 'c1-i1': { step: 0, dueDay: 'Monday', lastDay: null, lastOutcome: null } } }; }],
    ['a total for an unknown tag', (save) => { save.mistakeTotals = { tags: { MADE_UP: 1 }, competencies: {} }; }],
    ['a daily review over five tickets', (save) => { save.dailyReview = { day: '2026-03-02', itemIds: ['c1-i1', 'c1-i2', 'c1-i3', 'c1-i4', 'c2-i1', 'c2-i2'] }; }],
    ['an interview that is not empty', (save) => { save.interview = { id: 'set-1' }; }],
    ['an interview history that is not empty', (save) => { save.interviewHistory = [{}]; }],
  ];
  test.each(cases)('a save with %s is preserved as corrupt', (_, mutate) => {
    const save = base();
    mutate(save);
    expect(restoreSave(JSON.stringify(save), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
  });

  test('the empty version 4 fields restore as written', () => {
    expect(restoreSave(JSON.stringify(base()), itemIndex)).toMatchObject({ status: 'restored', writable: true });
  });

  test('a save from a version above 4 is never overwritten', () => {
    expect(restoreSave('{"version":7,"tickets":{}}', itemIndex)).toMatchObject({ status: 'future', writable: false });
  });
});
