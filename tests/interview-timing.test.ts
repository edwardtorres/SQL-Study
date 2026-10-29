import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { interviewItems } from '../src/data/interview';
import {
  checkpointProblem, closeProblem, drawInterview, estimateComparison, estimateOf, finishInterview, forgetOpen, isOffEstimate, openProblem,
  recordInterviewPass, startInterview,
} from '../src/game/interview';
import { emptySave, type InterviewResult, type InterviewSet } from '../src/save/format';

const NOON = Date.parse('2026-03-02T12:00:00Z');
const MIN = 60_000;
const DAY = '2026-03-02';
const inOrder = () => 0.999999;

const oneProblem = (minutes = 5, limit = 10): InterviewSet =>
  startInterview([{ id: 'int-01', chapterId: 4, minutes }], NOON, limit);

describe('chapter 13 estimates', () => {
  test('a chapter 13 problem is timed at its own estimate, not the six-minute default', () => {
    // Ten reserve problems come first, so the eleventh draw is the first unseen chapter 13 independent ticket.
    const drawn = drawInterview(emptySave(), itemIndex, 11, inOrder);
    expect(drawn[10]).toMatchObject({ id: 'c13-i1', minutes: 12 });
    expect(estimateOf(itemIndex, 'c13-i2')).toBe(10);
  });

  test('a chapter ticket with no estimate is timed at the default', () => {
    expect(estimateOf(itemIndex, 'dispatch')).toBe(6);
  });

  test('a reserve problem uses its own estimate', () => {
    expect(estimateOf(itemIndex, interviewItems[0]!.id)).toBe(interviewItems[0]!.estimatedMinutes);
  });
});

describe('solve time on a problem', () => {
  test('time counts while the workspace is open, and stops at a close', () => {
    let set = openProblem(oneProblem(), 'int-01', NOON);
    set = closeProblem(set, 'int-01', NOON + 90_000);
    expect(set.problems[0]).toMatchObject({ spentMs: 90_000, openedAt: null });
  });

  test('a checkpoint counts the time so far and keeps the workspace open from that moment', () => {
    let set = openProblem(oneProblem(), 'int-01', NOON);
    set = checkpointProblem(set, 'int-01', NOON + 30_000);
    expect(set.problems[0]).toMatchObject({ spentMs: 30_000, openedAt: NOON + 30_000 });
    set = checkpointProblem(set, 'int-01', NOON + 60_000);
    expect(set.problems[0]).toMatchObject({ spentMs: 60_000, openedAt: NOON + 60_000 });
  });

  test('a pass stops the count at the pass, and a passed problem is not timed again', () => {
    let set = openProblem(oneProblem(), 'int-01', NOON);
    set = recordInterviewPass(set, 'int-01', NOON + 150_000);
    expect(set.problems[0]).toMatchObject({ spentMs: 150_000, openedAt: null });
    set = openProblem(set, 'int-01', NOON + 200_000);
    expect(set.problems[0]).toMatchObject({ spentMs: 150_000, openedAt: null });
  });

  test('time after the deadline is not counted', () => {
    let set = openProblem(oneProblem(5, 2), 'int-01', NOON + MIN);
    set = closeProblem(set, 'int-01', NOON + 10 * MIN);
    expect(set.problems[0]!.spentMs).toBe(MIN);
  });

  test('opening one problem closes the one open before it', () => {
    let set = startInterview([{ id: 'int-01', chapterId: 4, minutes: 5 }, { id: 'int-02', chapterId: 5, minutes: 5 }], NOON, 10);
    set = openProblem(set, 'int-01', NOON);
    set = openProblem(set, 'int-02', NOON + 40_000);
    expect(set.problems.map((problem) => [problem.id, problem.spentMs, problem.openedAt])).toEqual([['int-01', 40_000, null], ['int-02', 0, NOON + 40_000]]);
  });

  test('a page that closed while a workspace was open clears the marker without counting its time', () => {
    let set = openProblem(oneProblem(), 'int-01', NOON);
    set = checkpointProblem(set, 'int-01', NOON + 30_000);
    set = openProblem(set, 'int-01', NOON + 30_000);
    const reloaded = forgetOpen(set);
    expect(reloaded.problems[0]).toMatchObject({ spentMs: 30_000, openedAt: null });
  });

  test('finishing a set leaves no open marker in its result', () => {
    let set = openProblem(oneProblem(5, 10), 'int-01', NOON);
    set = checkpointProblem(set, 'int-01', NOON + MIN);
    const { result } = finishInterview(emptySave(), itemIndex, set, NOON + 2 * MIN, DAY);
    expect(result.problems[0]).toMatchObject({ spentMs: MIN, openedAt: null, estimateMinutes: 5 });
  });

  test('a set keeps each problem\'s estimate from the start, as drawn', () => {
    const set = startInterview([{ id: 'c13-i1', chapterId: 13, minutes: 12 }], NOON, 12);
    expect(set.problems[0]!.estimateMinutes).toBe(12);
  });
});

describe('estimates against times', () => {
  const result = (spentMs: number, estimate: number | null, id = 'int-01'): InterviewResult => ({
    id: `set-${spentMs}`, startedAt: NOON, endedAt: NOON + MIN, limitMinutes: 10, expired: false,
    problems: [{ id, passedAt: NOON, failures: 0, spentMs, openedAt: null, estimateMinutes: estimate }],
  });

  test('the median of recorded times is compared with the estimate', () => {
    const [row] = estimateComparison([result(6 * MIN, 5), result(8 * MIN, 5), result(7 * MIN, 5)]);
    expect(row).toMatchObject({ id: 'int-01', estimate: 5, medianMinutes: 7, sets: 3 });
    expect(isOffEstimate(row!)).toBe(false);
  });

  test('a median more than half away from the estimate is marked off', () => {
    const [row] = estimateComparison([result(9 * MIN, 5), result(10 * MIN, 5)]);
    expect(row!.medianMinutes).toBe(9.5);
    expect(isOffEstimate(row!)).toBe(true);
  });

  test('results without a recorded time, and problems never timed, are left out', () => {
    expect(estimateComparison([result(MIN, null), result(0, 5)])).toEqual([]);
  });
});
