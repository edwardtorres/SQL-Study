import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { interviewItems } from '../src/data/interview';
import {
  DEFAULT_MINUTES, drawInterview, finishInterview, interviewCredit, interviewReady, isExpired, limitFor, recordInterviewFailure,
  recordInterviewPass, remainingMs, startInterview, type Candidate,
} from '../src/game/interview';
import { REPEAT_XP, readinessOf } from '../src/game/rules';
import { emptyProgress, emptySave, type InterviewProblem, type InterviewResult, type SaveV5 } from '../src/save/format';

const NOON = Date.parse('2026-03-02T12:00:00Z');
const DAY = '2026-03-02';
const pick = (ids: readonly string[]): Candidate[] => ids.map((id) => ({ id, chapterId: interviewItems.find((item) => item.id === id)!.chapterId, minutes: interviewItems.find((item) => item.id === id)!.estimatedMinutes ?? DEFAULT_MINUTES }));
// A fixed order: no shuffle, so the draw is the reserve in its declared order.
const inOrder = () => 0.999999;

function finished(save: SaveV5, ids: readonly string[], options: { passed: boolean[]; failures?: number[]; at?: number; expired?: boolean }): SaveV5 {
  const candidates = pick(ids);
  let set = startInterview(candidates, NOON);
  candidates.forEach((candidate, index) => {
    if ((options.failures?.[index] ?? 0) > 0) for (let n = 0; n < (options.failures?.[index] ?? 0); n += 1) set = recordInterviewFailure(set, candidate.id, NOON + 1000);
    if (options.passed[index]) set = recordInterviewPass(set, candidate.id, NOON + 60_000);
  });
  const endedAt = options.expired ? NOON + set.limitMinutes * 60_000 : options.at ?? NOON + 5 * 60_000;
  return finishInterview(save, itemIndex, set, endedAt, DAY).save;
}

describe('drawing a set', () => {
  test('the reserve comes first, in order when nothing is seen', () => {
    const drawn = drawInterview(emptySave(), itemIndex, 3, inOrder);
    expect(drawn.map((candidate) => candidate.id)).toEqual(interviewItems.slice(0, 3).map((item) => item.id));
  });

  test('a problem already seen is drawn after the unseen ones', () => {
    const save = { ...emptySave(), tickets: { [interviewItems[0]!.id]: { ...emptyProgress(), attempts: 2 } } };
    const drawn = drawInterview(save, itemIndex, 3, inOrder).map((candidate) => candidate.id);
    expect(drawn).not.toContain(interviewItems[0]!.id);
  });

  test('a set has three different problems, each with a competency', () => {
    const drawn = drawInterview(emptySave(), itemIndex, 3);
    expect(new Set(drawn.map((candidate) => candidate.id)).size).toBe(3);
    for (const candidate of drawn) expect(candidate.chapterId).toBeGreaterThanOrEqual(1);
  });
});

describe('the time limit and the deadline', () => {
  test('the limit is the sum of the estimates, rounded up to a whole minute', () => {
    expect(limitFor(pick(['int-01', 'int-02', 'int-03']))).toBe(
      Math.ceil(pick(['int-01', 'int-02', 'int-03']).reduce((sum, candidate) => sum + candidate.minutes, 0)),
    );
    expect(limitFor([{ id: 'a', chapterId: 1, minutes: 5 }, { id: 'b', chapterId: 1, minutes: 6 }, { id: 'c', chapterId: 1, minutes: 7 }])).toBe(18);
  });

  test('the deadline is the start plus the limit, and a set is expired from that instant', () => {
    const set = startInterview([{ id: 'a', chapterId: 1, minutes: 2 }], NOON, 2);
    expect(remainingMs(set, NOON)).toBe(120_000);
    expect(isExpired(set, NOON + 119_999)).toBe(false);
    expect(isExpired(set, NOON + 120_000)).toBe(true);
    expect(remainingMs(set, NOON + 200_000)).toBe(0);
  });

  test('a pass or a failure after the deadline is not recorded', () => {
    const set = startInterview([{ id: 'a', chapterId: 1, minutes: 2 }], NOON, 2);
    expect(recordInterviewPass(set, 'a', NOON + 120_000)).toEqual(set);
    expect(recordInterviewFailure(set, 'a', NOON + 120_000)).toEqual(set);
  });
});

describe('the credit for a problem', () => {
  const problem = (passedAt: number | null, failures: number): InterviewProblem => ({ id: 'x', passedAt, failures, spentMs: 0, openedAt: null, estimateMinutes: 5 });
  test('a first-time pass is 1, a pass after failures is 0.5, and no pass is 0', () => {
    expect(interviewCredit(problem(NOON, 0))).toBe(1);
    expect(interviewCredit(problem(NOON, 2))).toBe(0.5);
    expect(interviewCredit(problem(null, 3))).toBe(0);
  });
});

describe('settling a finished set', () => {
  test('each problem adds one readiness attempt, and mastery, mistakes and reviews are left alone', () => {
    const before = emptySave();
    const after = finished(before, ['int-01', 'int-02', 'int-03'], { passed: [true, false, true], failures: [0, 0, 0] });
    for (const chapterId of [4, 5, 3]) expect(readinessOf(after, chapterId).scored).toBe(1);
    expect(after.chapters).toEqual(before.chapters);
    expect(after.mistakeLog).toEqual(before.mistakeLog);
    expect(after.reviews).toEqual(before.reviews);
    expect(after.reviewRecent).toEqual(before.reviewRecent);
    expect(after.interview).toBeNull();
  });

  test('a first-time pass earns the independent award, and a repeat on the same day earns the repeat award once', () => {
    const once = finished(emptySave(), ['int-01'], { passed: [true] });
    expect(once.tickets['int-01']?.xp).toBe(35);
    const twice = finished(once, ['int-01'], { passed: [true] });
    expect(twice.tickets['int-01']?.xp).toBe(35 + REPEAT_XP);
    const thrice = finished(twice, ['int-01'], { passed: [true] });
    expect(thrice.tickets['int-01']?.xp).toBe(35 + REPEAT_XP);
  });

  test('an expired set records the problems that passed before the deadline, and counts the others as zero', () => {
    const after = finished(emptySave(), ['int-01', 'int-02'], { passed: [true, false], expired: true });
    expect(after.interviewHistory[0]).toMatchObject({ expired: true });
    expect(readinessOf(after, 4).scored).toBe(1);
    expect(readinessOf(after, 5).scored).toBe(1);
  });

  test('the history keeps the last twenty sets', () => {
    let save = emptySave();
    for (let index = 0; index < 25; index += 1) save = finished(save, ['int-01'], { passed: [true], at: NOON + index * 60_000 });
    expect(save.interviewHistory).toHaveLength(20);
  });
});

describe('interview-ready', () => {
  const result = (passed: boolean, expired = false): InterviewResult => ({
    id: 'set', startedAt: 0, endedAt: 1, limitMinutes: 10, expired,
    problems: [{ id: 'a', passedAt: passed ? 1 : null, failures: 0, spentMs: 0, openedAt: null, estimateMinutes: 5 }],
  });

  test('two of the last three sets, all passed and submitted in time, is ready', () => {
    expect(interviewReady([result(true), result(false), result(true)])).toBe(true);
    expect(interviewReady([result(true), result(true), result(true, true)])).toBe(true);
  });

  test('one set, or two with an expired set among them, is not ready', () => {
    expect(interviewReady([result(true)])).toBe(false);
    expect(interviewReady([result(true), result(true, true), result(false)])).toBe(false);
  });

  test('an older set does not count once it is outside the last three', () => {
    expect(interviewReady([result(true), result(true), result(false), result(false)])).toBe(false);
  });
});
