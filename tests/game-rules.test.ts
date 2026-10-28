import { describe, expect, test } from 'vitest';
import { itemIndex, type ItemMeta } from '../src/data/itemIndex';
import {
  applySubmission, awardFor, BADGES, CREDIT, currentStreak, dayGap, deskStatus, entryLevelReady, isMastered, isOpen, levelOf, levelStart,
  localDay, normalizeSql, rankOf, readinessAll, readinessOf, recordStreakItem, revealSolution, settle, takeHint, totalXp,
} from '../src/game/rules';
import { emptyProgress, emptySave, type SaveV3, type Streak, type TicketProgress } from '../src/save/format';

const REFERENCE = 'SELECT reference FROM shipments';
const ZONE = 'America/New_York';
const NOON = '2026-03-02T12:00:00Z';

const item = (id: string, pool: readonly ItemMeta[] = itemIndex): ItemMeta => {
  const found = pool.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown item ${id}`);
  return found;
};
const bossPartsOf = (chapterId: number): string[] => itemIndex
  .filter((candidate) => candidate.chapterId === chapterId && candidate.bossGroup !== undefined)
  .map((candidate) => candidate.id);

// One graded submission. The default query differs from the reference, so it is an ordinary pass.
function grade(save: SaveV3, id: string, options: { passed?: boolean; sql?: string; at?: string; zone?: string; pool?: readonly ItemMeta[] } = {}) {
  const pool = options.pool ?? itemIndex;
  const at = Date.parse(options.at ?? NOON);
  return applySubmission(save, pool, item(id, pool), REFERENCE, {
    passed: options.passed ?? true, sql: options.sql ?? 'SELECT other FROM shipments', at, day: localDay(at, options.zone ?? 'UTC'),
  });
}

function passAll(save: SaveV3, ids: readonly string[], at = NOON): SaveV3 {
  return ids.reduce((next, id) => grade(next, id, { at }).save, save);
}

function ticket(overrides: Partial<TicketProgress>): TicketProgress {
  return { ...emptyProgress(), passed: true, firstOutcome: 'first-try', firstPassAt: 0, passedAt: 0, ...overrides };
}

describe('XP and hint costs', () => {
  test('the award table: first try adds the bonus, hints cost 5 each, a reveal earns a flat 5', () => {
    expect(awardFor('guided', 'first-try', 0)).toBe(15);
    expect(awardFor('independent', 'first-try', 0)).toBe(35);
    expect(awardFor('boss', 'first-try', 0)).toBe(65);
    expect(awardFor('guided', 'hinted', 1)).toBe(5);
    expect(awardFor('independent', 'hinted', 2)).toBe(15);
    expect(awardFor('boss', 'hinted', 3)).toBe(35);
    expect(awardFor('guided', 'hinted', 3)).toBe(0);
    for (const kind of ['guided', 'independent', 'boss'] as const) expect(awardFor(kind, 'revealed', 3)).toBe(5);
  });

  test('a first pass after a failure is hinted, so it has no first-try bonus', () => {
    const failed = grade(emptySave(), 'c1-i1', { passed: false }).save;
    const passed = grade(failed, 'c1-i1');
    expect(passed.outcome).toBe('hinted');
    expect(passed.xp).toBe(25);
  });

  test('two hints before a guided pass leave 0 XP, never below zero', () => {
    const save = takeHint(takeHint(emptySave(), 'c1-g1'), 'c1-g1');
    const result = grade(save, 'c1-g1');
    expect(result.outcome).toBe('hinted');
    expect(result.xp).toBe(0);
    expect(totalXp(result.save)).toBe(0);
  });

  test('hints stop at three tiers', () => {
    let save = emptySave();
    for (let press = 0; press < 5; press += 1) save = takeHint(save, 'c1-g1');
    expect(save.tickets['c1-g1']!.hintTier).toBe(3);
  });

  test('the first pass sets the award, so a hint taken after it costs nothing', () => {
    const first = grade(emptySave(), 'c1-g1');
    expect(takeHint(first.save, 'c1-g1').tickets['c1-g1']!.xp).toBe(first.xp);
  });

  test('a repeat pass earns 1 XP once per local day', () => {
    const first = grade(emptySave(), 'c1-i1', { at: '2026-03-02T09:00:00Z' });
    const again = grade(first.save, 'c1-i1', { at: '2026-03-02T10:00:00Z' });
    const third = grade(again.save, 'c1-i1', { at: '2026-03-02T11:00:00Z' });
    const nextDay = grade(third.save, 'c1-i1', { at: '2026-03-03T11:00:00Z' });
    expect([first.xp, again.xp, third.xp, nextDay.xp]).toEqual([35, 1, 0, 1]);
  });

  test('a failed submission earns nothing and counts as a failure', () => {
    const failed = grade(emptySave(), 'c1-i1', { passed: false });
    expect(failed).toMatchObject({ xp: 0, counted: false });
    expect(failed.save.tickets['c1-i1']).toMatchObject({ attempts: 1, failures: 1, passed: false });
  });
});

describe('levels', () => {
  test('the table starts at 0, 100, 250, 450, 700, 1000 and steps up by 50', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(levelStart)).toEqual([0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250]);
  });

  test('levels come from XP', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, span: 100 });
    expect(levelOf(99).level).toBe(1);
    expect(levelOf(100)).toEqual({ level: 2, into: 0, span: 150 });
    expect(levelOf(3250).level).toBe(11);
  });
});

describe('ranks, gating and test-outs', () => {
  test('ranks follow mastery of chapters 3, 6, 9 and 13', () => {
    const mastered = (...chapters: number[]) => ({ chapters: Object.fromEntries(chapters.map((id) => [String(id), { method: 'boss' as const, masteredAt: 0 }])) });
    expect(rankOf(mastered())).toBe('Intern');
    expect(rankOf(mastered(1, 2, 3))).toBe('Junior Analyst');
    expect(rankOf(mastered(1, 2, 3, 4, 5, 6))).toBe('Analyst');
    expect(rankOf(mastered(1, 2, 3, 4, 5, 6, 7, 8, 9))).toBe('Junior Data Engineer');
    expect(rankOf(mastered(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13))).toBe('Data Engineer I');
  });

  test('chapter 1 is open, and each later chapter opens when the one before it is mastered', () => {
    expect(isOpen(emptySave(), 1)).toBe(true);
    expect(isOpen(emptySave(), 2)).toBe(false);
    const chapterOne = passAll(emptySave(), bossPartsOf(1));
    expect(isMastered(chapterOne, 1)).toBe(true);
    expect(isOpen(chapterOne, 2)).toBe(true);
    expect(isOpen(chapterOne, 3)).toBe(false);
  });

  test('a locked chapter takes no submissions', () => {
    const result = grade(emptySave(), 'c2-g1');
    expect(result).toMatchObject({ counted: false, xp: 0 });
    expect(result.save.tickets).toEqual({});
  });

  test('desks show locked, open, in progress, mastered and mastered by test-out', () => {
    const fresh = emptySave();
    expect(deskStatus(itemIndex, fresh, 2)).toBe('locked');
    expect(deskStatus(itemIndex, fresh, 1)).toBe('open');
    expect(deskStatus(itemIndex, grade(fresh, 'c1-g1').save, 1)).toBe('in-progress');
    const testedOut = passAll(fresh, bossPartsOf(1));
    expect(deskStatus(itemIndex, testedOut, 1)).toBe('tested-out');
    expect(deskStatus(itemIndex, testedOut, 2)).toBe('open');
  });

  test('a boss passed with nothing else done is a test-out', () => {
    expect(passAll(emptySave(), bossPartsOf(1)).chapters['1']).toMatchObject({ method: 'test-out' });
  });

  test('a lesson answered before the boss makes the mastery a normal one', () => {
    const withLesson = { ...emptySave(), lessons: { 'c1-s1': { read: true, answer: 'a', correct: true } } };
    expect(passAll(withLesson, bossPartsOf(1)).chapters['1']).toMatchObject({ method: 'boss' });
  });

  test('a passed guided ticket before the boss makes the mastery a normal one', () => {
    expect(passAll(grade(emptySave(), 'c1-g1').save, bossPartsOf(1)).chapters['1']).toMatchObject({ method: 'boss' });
  });

  test('the chapter is mastered only when every boss part passes', () => {
    const [first, ...rest] = bossPartsOf(1) as [string, ...string[]];
    const partial = passAll(emptySave(), [first]);
    expect(isMastered(partial, 1)).toBe(false);
    expect(isMastered(passAll(partial, rest), 1)).toBe(true);
  });

  test('promotion is reported on the grade that changes the rank, and not again after', () => {
    const save = passAll(emptySave(), [...bossPartsOf(1), ...bossPartsOf(2)]);
    const results = bossPartsOf(3).reduce<{ save: SaveV3; promoted: (string | null)[] }>((state, id) => {
      const result = grade(state.save, id);
      return { save: result.save, promoted: [...state.promoted, result.promoted] };
    }, { save, promoted: [] });
    expect(results.promoted.filter((rank) => rank !== null)).toEqual(['Junior Analyst']);
  });
});

describe('reveal rules', () => {
  test('revealing a boss part after its pass voids that pass, so the chapter is not mastered', () => {
    const [first, second, third] = bossPartsOf(1) as [string, string, string];
    let save = grade(emptySave(), first).save;
    save = revealSolution(save, first, Date.parse('2026-03-02T13:00:00Z'));
    save = passAll(save, [second, third], '2026-03-02T14:00:00Z');
    expect(isMastered(save, 1)).toBe(false);
  });

  test('a pass of a revealed boss part with the reference query does not count', () => {
    const first = bossPartsOf(1)[0]!;
    const revealed = revealSolution(emptySave(), first, Date.parse('2026-03-02T11:00:00Z'));
    const copy = grade(revealed, first, { sql: '  select  reference from shipments ; ' });
    expect(copy).toMatchObject({ counted: false, copyOfReveal: true, xp: 0 });
    expect(copy.save.tickets[first]!.passed).toBe(false);
  });

  test('a different query passes a revealed boss part again, and that pass counts', () => {
    const [first, ...rest] = bossPartsOf(1) as [string, ...string[]];
    let save = revealSolution(emptySave(), first, Date.parse('2026-03-02T11:00:00Z'));
    save = grade(save, first, { at: NOON }).save;
    expect(save.tickets[first]!.passedAt).toBe(Date.parse(NOON));
    expect(isMastered(passAll(save, rest), 1)).toBe(true);
  });

  test('revealing a guided ticket never blocks its pass, and its award is the flat reveal', () => {
    const revealed = revealSolution(emptySave(), 'c1-g1', Date.parse('2026-03-02T11:00:00Z'));
    expect(grade(revealed, 'c1-g1', { sql: REFERENCE })).toMatchObject({ counted: true, outcome: 'revealed', xp: 5 });
  });

  test('revealing after a pass keeps the XP that pass earned', () => {
    const first = grade(emptySave(), 'c1-i1').save;
    expect(revealSolution(first, 'c1-i1', Date.parse('2026-03-02T13:00:00Z')).tickets['c1-i1']!.xp).toBe(35);
  });

  test('mastery is kept once earned, so a later reveal does not take it back', () => {
    const mastered = passAll(emptySave(), bossPartsOf(1));
    expect(isMastered(revealSolution(mastered, bossPartsOf(1)[0]!, Date.parse('2026-03-09T13:00:00Z')), 1)).toBe(true);
  });

  test('normalizing ignores whitespace, letter case and a trailing semicolon, and nothing more', () => {
    expect(normalizeSql('SELECT  id\nFROM shipments ;')).toBe(normalizeSql('select id from shipments'));
    expect(normalizeSql("SELECT 'A' FROM t")).not.toBe(normalizeSql("SELECT 'B' FROM t"));
  });
});

describe('streaks and local days', () => {
  test('a day counts once three different items pass on it, and repeats of one item do not add up', () => {
    let streak = emptySave().streak;
    streak = recordStreakItem(streak, '2026-03-02', 'c1-i1');
    streak = recordStreakItem(streak, '2026-03-02', 'c1-i1');
    streak = recordStreakItem(streak, '2026-03-02', 'c1-i2');
    expect(streak.countedDay).toBeNull();
    streak = recordStreakItem(streak, '2026-03-02', 'c1-i3');
    expect(streak).toMatchObject({ countedDay: '2026-03-02', current: 1, longest: 1 });
  });

  test('the streak crosses the 1 November 2026 daylight-saving change as calendar days', () => {
    const passes = [
      ['c1-i1', '2026-10-31T12:00:00-04:00'], ['c1-i2', '2026-10-31T12:00:00-04:00'], ['c1-i3', '2026-10-31T23:30:00-04:00'],
      ['c1-i1', '2026-11-01T01:30:00-04:00'], ['c1-i2', '2026-11-01T01:30:00-05:00'], ['c1-i3', '2026-11-01T23:00:00-05:00'],
      ['c1-i1', '2026-11-02T00:30:00-05:00'], ['c1-i2', '2026-11-02T00:31:00-05:00'], ['c1-i3', '2026-11-02T00:32:00-05:00'],
    ] as const;
    const save = passes.reduce((state, [id, when]) => grade(state, id, { at: when, zone: ZONE }).save, emptySave());
    expect(save.streak).toMatchObject({ current: 3, longest: 3, countedDay: '2026-11-02' });
    expect(dayGap('2026-10-31', '2026-11-01')).toBe(1);
    expect(localDay(Date.parse('2026-11-01T05:30:00Z'), ZONE)).toBe('2026-11-01');
    expect(localDay(Date.parse('2026-11-01T06:30:00Z'), ZONE)).toBe('2026-11-01');
  });

  test('midnight belongs to the new local day', () => {
    expect(localDay(Date.parse('2026-03-02T04:59:59Z'), ZONE)).toBe('2026-03-01');
    expect(localDay(Date.parse('2026-03-02T05:00:00Z'), ZONE)).toBe('2026-03-02');
  });

  test('a missed day resets the current streak but keeps the longest', () => {
    const streak: Streak = { current: 4, longest: 4, countedDay: '2026-03-02', itemsDay: null, items: [] };
    expect(currentStreak(streak, '2026-03-03')).toBe(4);
    expect(currentStreak(streak, '2026-03-04')).toBe(0);
    const restarted = ['c1-i1', 'c1-i2', 'c1-i3'].reduce((next, id) => recordStreakItem(next, '2026-03-05', id), streak);
    expect(restarted).toMatchObject({ current: 1, longest: 4, countedDay: '2026-03-05' });
  });
});

describe('badges', () => {
  test('a boss passed first try with no hints or reveal earns its badge, and a hinted part does not', () => {
    const [first] = bossPartsOf(1) as [string, ...string[]];
    expect(passAll(emptySave(), bossPartsOf(1)).badges['boss-first-try']).toBeDefined();
    const hintedFirst = passAll(takeHint(emptySave(), first), bossPartsOf(1));
    expect(isMastered(hintedFirst, 1)).toBe(true);
    expect(hintedFirst.badges['boss-first-try']).toBeUndefined();
  });

  test('a rank badge follows its chapter mastery', () => {
    const save = settle(itemIndex, { ...emptySave(), chapters: { '3': { method: 'boss', masteredAt: 7 } } }, 7);
    expect(save.badges).toMatchObject({ 'rank-junior-analyst': 7 });
    expect(save.badges['rank-analyst']).toBeUndefined();
  });

  test('chapter 8 needs every item passed with no reveal', () => {
    const chapterEight = itemIndex.filter((candidate) => candidate.chapterId === 8).map((candidate) => candidate.id);
    const passed = Object.fromEntries(chapterEight.map((id) => [id, ticket({})]));
    expect(settle(itemIndex, { ...emptySave(), tickets: passed }, 1).badges['chapter-8-complete']).toBe(1);
    const revealed = { ...passed, [chapterEight[0]!]: ticket({ revealedAt: 0, solutionRevealed: true, firstOutcome: 'revealed' }) };
    expect(settle(itemIndex, { ...emptySave(), tickets: revealed }, 1).badges['chapter-8-complete']).toBeUndefined();
  });

  test('ten independent first-try passes in a row earn the badge, and a hinted independent pass breaks the run', () => {
    const pool: ItemMeta[] = Array.from({ length: 20 }, (_, index) => ({ ...item('c1-i1'), id: `run-${index}`, title: `run ${index}` }));
    let save = emptySave();
    for (const candidate of pool.slice(0, 9)) save = grade(save, candidate.id, { pool }).save;
    expect(save.longestRun).toBe(9);
    save = grade(takeHint(save, 'run-9'), 'run-9', { pool }).save;
    expect(save.independentRun).toBe(0);
    save = pool.slice(10).reduce((next, candidate) => grade(next, candidate.id, { pool }).save, save);
    expect(save.independentRun).toBe(10);
    expect(save.badges['ten-in-a-row']).toBeDefined();
  });

  test('streak badges use the longest streak, and all-chapters needs all 13 mastered', () => {
    const streak = { current: 0, longest: 7, countedDay: null, itemsDay: null, items: [] };
    expect(BADGES.find((badge) => badge.id === 'streak-7')!.earned(itemIndex, { ...emptySave(), streak })).toBe(true);
    const every = Object.fromEntries(Array.from({ length: 13 }, (_, index) => [String(index + 1), { method: 'boss' as const, masteredAt: 0 }]));
    expect(settle(itemIndex, { ...emptySave(), chapters: every }, 0).badges['all-chapters']).toBe(0);
    expect(settle(itemIndex, { ...emptySave(), chapters: { '1': every['1']! } }, 0).badges['all-chapters']).toBeUndefined();
  });

  test('there are 11 badges, and an earned badge is never removed', () => {
    expect(BADGES).toHaveLength(11);
    expect(settle(itemIndex, { ...emptySave(), badges: { 'streak-7': 5 } }, 9).badges['streak-7']).toBe(5);
  });
});

describe('readiness', () => {
  const independent = (count: number, chapterId = 1): ItemMeta[] => Array.from({ length: count }, (_, index) => ({
    ...item('c1-i1'), id: `c${chapterId}-r${index}`, chapterId, title: `r${index}`,
  }));

  test('fewer than five scored items shows no score, and five first passes show one', () => {
    const items = independent(5);
    let save = emptySave();
    for (const candidate of items.slice(0, 4)) save = applySubmission(save, items, candidate, REFERENCE, { passed: true, sql: 'x', at: 1, day: '2026-03-02' }).save;
    expect(readinessOf(items, save, 1)).toMatchObject({ scored: 4, score: null, ready: false });
    save = applySubmission(save, items, items[4]!, REFERENCE, { passed: true, sql: 'x', at: 2, day: '2026-03-02' }).save;
    expect(readinessOf(items, save, 1)).toMatchObject({ scored: 5, score: 1, ready: true });
  });

  test('credit is 1 for a first try, 0.5 for a hinted pass and 0 for a reveal, and 0.8 or more is ready', () => {
    expect(CREDIT).toEqual({ 'first-try': 1, hinted: 0.5, revealed: 0 });
    const items = independent(5);
    const pass = (save: SaveV3, index: number, outcome: TicketProgress['firstOutcome']) => ({
      ...save, tickets: { ...save.tickets, [items[index]!.id]: ticket({ firstPassAt: index + 1, firstOutcome: outcome }) },
    });
    const below = [0, 1, 2].reduce((save, index) => pass(save, index, 'first-try'), pass(pass(emptySave(), 3, 'hinted'), 4, 'revealed'));
    expect(readinessOf(items, below, 1)).toMatchObject({ score: 0.7, ready: false });
    const atThreshold = [0, 1, 2, 3].reduce((save, index) => pass(save, index, 'first-try'), pass(emptySave(), 4, 'revealed'));
    expect(readinessOf(items, atThreshold, 1)).toMatchObject({ score: 0.8, ready: true });
  });

  test('only the ten most recent scored first passes count', () => {
    const items = independent(12);
    const tickets = Object.fromEntries(items.map((candidate, index) => [candidate.id, ticket({ firstPassAt: index, firstOutcome: index < 2 ? 'revealed' : 'first-try' })]));
    expect(readinessOf(items, { tickets }, 1)).toMatchObject({ scored: 10, score: 1 });
  });

  test('guided tickets and sample tickets are not scored', () => {
    const tickets = { 'c1-g1': ticket({ firstPassAt: 1 }), dispatch: ticket({ firstPassAt: 2 }) };
    expect(readinessOf(itemIndex, { tickets }, 1).scored).toBe(0);
  });

  test('the entry-level signal needs every one of the 13 competencies ready', () => {
    const items = Array.from({ length: 13 }, (_, chapter) => independent(5, chapter + 1)).flat();
    const tickets = Object.fromEntries(items.map((candidate, index) => [candidate.id, ticket({ firstPassAt: index })]));
    expect(readinessAll(items, { tickets })).toHaveLength(13);
    expect(entryLevelReady(readinessAll(items, { tickets }))).toBe(true);
    const missingChapterThirteen = Object.fromEntries(Object.entries(tickets).filter(([id]) => !id.startsWith('c13-')));
    expect(entryLevelReady(readinessAll(items, { tickets: missingChapterThirteen }))).toBe(false);
  });

  test('a first-try pass earns the full credit whether it is a boss part or an independent ticket', () => {
    const bossFirst = bossPartsOf(1)[0]!;
    expect(grade(emptySave(), bossFirst).outcome).toBe('first-try');
    expect(CREDIT[grade(emptySave(), bossFirst).outcome!]).toBe(1);
  });
});

describe('XP totals', () => {
  test('total XP is the sum of the tickets', () => {
    expect(totalXp({ ...emptySave(), tickets: { a: ticket({ xp: 15 }), b: ticket({ xp: 35 }) } })).toBe(50);
  });
});
