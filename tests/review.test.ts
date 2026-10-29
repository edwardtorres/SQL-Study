import { describe, expect, test } from 'vitest';
import { itemIndex, type ItemMeta } from '../src/data/itemIndex';
import { itemTags } from '../src/data/itemTags';
import { applySubmission, CREDIT, readinessOf, reviewCredit, revealSolution } from '../src/game/rules';
import {
  addDays, appendMistake, appendReviewOutcome, dailyReviewSet, isDue, MISTAKE_LOG_CAP, needsReview, needsReviewSet, REVIEW_INTERVALS,
  scheduleAfter, weakSpots, withMiss, withReview,
} from '../src/game/review';
import { emptyProgress, emptySave, type MistakeEntry, type SaveV4 } from '../src/save/format';

const DAY = '2026-03-02';
const REFERENCE = 'SELECT reference FROM shipments';
const item = (id: string): ItemMeta => {
  const found = itemIndex.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown item ${id}`);
  return found;
};
const gapDays = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86_400_000;
const open = { items: itemIndex, isOpen: () => true };
const tagged = (tag: string): ItemMeta[] => itemIndex.filter((candidate) => (itemTags[candidate.id] as readonly string[] | undefined)?.includes(tag) === true);
const seen = (ids: readonly string[]): SaveV4['tickets'] => Object.fromEntries(ids.map((id) => [id, { ...emptyProgress(), attempts: 1 }]));

describe('addDays and the intervals', () => {
  test('whole calendar days cross month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('the intervals are 1, 2, 4, 7, 14 and 30 days', () => {
    expect([...REVIEW_INTERVALS]).toEqual([1, 2, 4, 7, 14, 30]);
  });
});

describe('schedules', () => {
  test('a first pass is due tomorrow, and each pass steps through the intervals and stays at 30 days', () => {
    let schedule = scheduleAfter(undefined, true, DAY);
    expect(schedule).toMatchObject({ step: 0, dueDay: '2026-03-03', lastOutcome: 'pass' });
    const gaps: number[] = [];
    for (let pass = 0; pass < 6; pass += 1) {
      const next = scheduleAfter(schedule, true, schedule.dueDay);
      gaps.push(gapDays(schedule.dueDay, next.dueDay));
      schedule = next;
    }
    expect(gaps).toEqual([2, 4, 7, 14, 30, 30]);
    expect(schedule.step).toBe(5);
  });

  test('a miss resets any schedule to step 0, due the next day', () => {
    const advanced = scheduleAfter(scheduleAfter(undefined, true, DAY), true, '2026-03-03');
    expect(advanced.step).toBeGreaterThan(0);
    expect(scheduleAfter(advanced, false, '2026-03-10')).toMatchObject({ step: 0, dueDay: '2026-03-11', lastOutcome: 'miss' });
  });

  test('a schedule is due on its due day and after it, not before', () => {
    const schedule = scheduleAfter(undefined, false, DAY);
    expect(isDue(schedule, '2026-03-02')).toBe(false);
    expect(isDue(schedule, '2026-03-03')).toBe(true);
    expect(isDue(undefined, '2026-03-03')).toBe(false);
  });

  test('a failure starts the ticket and its matched tag at step 0; a review advances the ticket and every tag it models', () => {
    const reviews = withMiss({ items: {}, tags: {} }, 'c1-i1', 'GE_VS_GT', DAY);
    expect(reviews.items['c1-i1']).toMatchObject({ step: 0, dueDay: '2026-03-03' });
    expect(reviews.tags['GE_VS_GT']).toMatchObject({ step: 0, dueDay: '2026-03-03' });
    const modelled = itemTags['c13-g1'] ?? [];
    expect(modelled.length).toBeGreaterThan(0);
    const reviewed = withReview({ items: {}, tags: {} }, 'c13-g1', true, DAY);
    for (const tag of modelled) expect(reviewed.tags[tag]).toMatchObject({ step: 0, lastOutcome: 'pass' });
    const again = withReview(reviewed, 'c13-g1', true, '2026-03-03');
    for (const tag of modelled) expect(again.tags[tag]!.step).toBe(1);
  });
});

describe('the mistake log and the review window', () => {
  test('the log keeps the most recent entries, while the totals keep every count', () => {
    const entry: MistakeEntry = { at: 1, day: DAY, itemId: 'c1-i1', competency: 1, tag: 'GE_VS_GT', kind: 'failed' };
    let save = emptySave();
    for (let index = 0; index < MISTAKE_LOG_CAP + 1; index += 1) save = { ...save, ...appendMistake(save, entry) };
    expect(save.mistakeLog).toHaveLength(MISTAKE_LOG_CAP);
    expect(save.mistakeTotals.tags['GE_VS_GT']).toBe(MISTAKE_LOG_CAP + 1);
    expect(save.mistakeTotals.competencies['1']).toBe(MISTAKE_LOG_CAP + 1);
  });

  test('a review window keeps the last five outcomes', () => {
    const recent = ['miss', 'pass', 'pass', 'miss', 'miss', 'pass'].reduce<SaveV4['reviewRecent']>(
      (state, outcome) => appendReviewOutcome(state, 1, outcome === 'pass'), {},
    );
    expect(recent['1']).toEqual(['pass', 'pass', 'miss', 'miss', 'pass']);
  });

  test('needs review needs five attempts and a pass rate under 60 percent', () => {
    expect(needsReview({ reviewRecent: { '1': ['pass', 'miss', 'miss', 'pass'] } }, 1)).toBe(false);
    expect(needsReview({ reviewRecent: { '1': ['pass', 'miss', 'miss', 'pass', 'miss'] } }, 1)).toBe(true);
    expect(needsReview({ reviewRecent: { '1': ['pass', 'pass', 'pass', 'miss', 'miss'] } }, 1)).toBe(false);
  });

  test('passes that lift the rate to 60 percent clear the needs-review mark', () => {
    const recovering = { reviewRecent: { '1': ['miss', 'miss', 'pass', 'pass', 'pass'] as ('pass' | 'miss')[] } };
    expect(needsReview(recovering, 1)).toBe(false);
    const stillFailing = { reviewRecent: { '1': ['miss', 'miss', 'miss', 'miss', 'pass'] as ('pass' | 'miss')[] } };
    expect(needsReview(stillFailing, 1)).toBe(true);
  });
});

describe('the Daily Review set', () => {
  test('a set saved for the day is returned as it was', () => {
    const save: SaveV4 = { ...emptySave(), dailyReview: { day: DAY, itemIds: ['c1-i2'] } };
    expect(dailyReviewSet(save, DAY, [13, 1], open)).toEqual(['c1-i2']);
  });

  test('a due tag offers a seen ticket that models it, not the ticket failed most recently', () => {
    const candidates = tagged('GE_VS_GT').map((candidate) => candidate.id);
    expect(candidates.length).toBeGreaterThan(1);
    const save: SaveV4 = {
      ...emptySave(),
      tickets: seen(candidates),
      reviews: { items: {}, tags: { GE_VS_GT: scheduleAfter(undefined, false, '2026-02-28') } },
      mistakeLog: [{ at: 1, day: '2026-02-28', itemId: candidates[0]!, competency: 1, tag: 'GE_VS_GT', kind: 'failed' }],
    };
    const picked = dailyReviewSet(save, DAY, [], open);
    expect(picked).toHaveLength(1);
    expect(picked[0]).not.toBe(candidates[0]);
    expect(candidates).toContain(picked[0]);
  });

  test('a due ticket that was never seen is not offered', () => {
    const save: SaveV4 = { ...emptySave(), reviews: { items: {}, tags: { GE_VS_GT: scheduleAfter(undefined, false, '2026-02-28') } } };
    expect(dailyReviewSet(save, DAY, [], open)).toEqual([]);
  });

  test('the set never exceeds five tickets', () => {
    const tags = Object.keys(itemTags).flatMap((id) => itemTags[id] ?? []);
    const distinct = [...new Set(tags)].slice(0, 8);
    const allSeen = seen(itemIndex.map((candidate) => candidate.id));
    const save: SaveV4 = {
      ...emptySave(),
      tickets: allSeen,
      reviews: { items: {}, tags: Object.fromEntries(distinct.map((tag) => [tag, scheduleAfter(undefined, false, '2026-02-20')])) },
    };
    expect(dailyReviewSet(save, DAY, [], open)).toHaveLength(5);
  });

  test('when no tag is due, the set is topped up from the weakest competency first', () => {
    const save: SaveV4 = { ...emptySave(), tickets: seen(itemIndex.filter((candidate) => candidate.chapterId === 13).map((candidate) => candidate.id)) };
    const picked = dailyReviewSet(save, DAY, [13, 1], open);
    expect(picked).toHaveLength(5);
    expect(picked.every((id) => item(id).chapterId === 13)).toBe(true);
  });

  test('closed chapters are never offered', () => {
    const save: SaveV4 = { ...emptySave(), tickets: seen(itemIndex.filter((candidate) => candidate.chapterId === 13).map((candidate) => candidate.id)) };
    expect(dailyReviewSet(save, DAY, [13], { items: itemIndex, isOpen: (chapter) => chapter === 1 })).toEqual([]);
  });

  test('among tickets with the same tag, the one passed longest ago is offered first', () => {
    const candidates = tagged('GE_VS_GT');
    const older = candidates[0]!;
    const passedTickets = Object.fromEntries(candidates.map((candidate, index) => [candidate.id, { ...emptyProgress(), attempts: 1, passed: true, passedAt: 1_000 * (index + 1) }]));
    const save: SaveV4 = {
      ...emptySave(),
      tickets: passedTickets,
      reviews: { items: {}, tags: { GE_VS_GT: scheduleAfter(undefined, false, '2026-02-28') } },
      mistakeLog: [],
    };
    expect(dailyReviewSet(save, DAY, [], open)[0]).toBe(older.id);
  });
});

describe('needs-review set and Weak Spots', () => {
  test('the needs-review set is up to three seen tickets in the competency, least recently passed first', () => {
    const chapterOne = itemIndex.filter((candidate) => candidate.chapterId === 1).map((candidate) => candidate.id);
    const tickets = { ...seen(chapterOne), [chapterOne[0]!]: { ...emptyProgress(), attempts: 1, passed: true, passedAt: 500 } };
    const set = needsReviewSet({ ...emptySave(), tickets }, 1, open);
    expect(set).toHaveLength(3);
    expect(set[0]).not.toBe(chapterOne[0]);
  });

  test('Weak Spots ranks unscored competencies last and lists the top tags by count', () => {
    const save: SaveV4 = {
      ...emptySave(),
      mistakeTotals: { tags: { GE_VS_GT: 4, LIMIT_MISSING: 9, FILTER_MISSING: 4, WRONG_VALUE: 1, WRONG_SOURCE: 2, STRING_INDEX: 7, CASE_ORDER: 3 }, competencies: {} },
    };
    const scores = [
      { chapterId: 1, score: null, scored: 2 },
      { chapterId: 2, score: 0.9, scored: 6 },
      { chapterId: 3, score: 0.4, scored: 5 },
    ];
    const spots = weakSpots(save, scores);
    expect(spots.competencies.map((row) => row.chapterId)).toEqual([3, 2, 1]);
    expect(spots.tags.map((row) => row.tag)).toEqual(['LIMIT_MISSING', 'STRING_INDEX', 'FILTER_MISSING', 'GE_VS_GT', 'CASE_ORDER']);
  });

  test('Weak Spots lists revealed tickets, most recent reveal first, and failed unpassed tickets', () => {
    const save: SaveV4 = {
      ...emptySave(),
      tickets: {
        'c1-i1': { ...emptyProgress(), solutionRevealed: true, revealedAt: 100, attempts: 1 },
        'c1-i2': { ...emptyProgress(), solutionRevealed: true, revealedAt: 200, attempts: 1 },
        'c1-i3': { ...emptyProgress(), failures: 1, attempts: 1 },
      },
    };
    const spots = weakSpots(save, []);
    expect(spots.revealed).toEqual(['c1-i2', 'c1-i1']);
    expect(spots.failed).toEqual(['c1-i3']);
  });
});

describe('grading writes the review state', () => {
  test('a failed attempt logs its tag and resets its schedules; a passed learning attempt logs nothing', () => {
    const failed = applySubmission(emptySave(), itemIndex, item('c1-i1'), REFERENCE, { passed: false, sql: 'x', at: 1, day: DAY, tag: 'GE_VS_GT' });
    expect(failed.save.mistakeLog).toEqual([{ at: 1, day: DAY, itemId: 'c1-i1', competency: 1, tag: 'GE_VS_GT', kind: 'failed' }]);
    expect(failed.save.reviews.items['c1-i1']).toMatchObject({ dueDay: '2026-03-03' });
    expect(failed.save.reviews.tags['GE_VS_GT']).toMatchObject({ dueDay: '2026-03-03' });
    const passed = applySubmission(failed.save, itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'y', at: 2, day: DAY });
    expect(passed.save.mistakeLog).toHaveLength(1);
    expect(passed.save.reviewRecent).toEqual({});
  });

  test('a reveal is logged once with no tag and resets the ticket schedule', () => {
    const once = revealSolution(emptySave(), item('c1-i1'), 1, DAY);
    const twice = revealSolution(once, item('c1-i1'), 2, DAY);
    expect(twice.mistakeLog).toEqual([{ at: 1, day: DAY, itemId: 'c1-i1', competency: 1, tag: null, kind: 'revealed' }]);
    expect(once.reviews.items['c1-i1']).toMatchObject({ step: 0, dueDay: '2026-03-03' });
  });

  test('a review pass adds its credit to readiness and a pass to the review window', () => {
    const first = applySubmission(emptySave(), itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'x', at: 1, day: DAY });
    const review = applySubmission(first.save, itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'y', at: 2, day: '2026-03-03', reviewing: true });
    expect(readinessOf(review.save, 1).scored).toBe(2);
    expect(review.save.reviewRecent['1']).toEqual(['pass']);
    expect(review.save.reviews.items['c1-i1']).toMatchObject({ lastOutcome: 'pass' });
  });

  test('a hinted review earns half credit and a reveal during review earns none, which counts as a miss', () => {
    expect(reviewCredit({ hinted: true })).toBe(0.5);
    expect(reviewCredit({ revealed: true, hinted: true })).toBe(0);
    expect(reviewCredit({})).toBe(1);
    const first = applySubmission(emptySave(), itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'x', at: 1, day: DAY });
    const hinted = applySubmission(first.save, itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'y', at: 2, day: '2026-03-03', reviewing: true, hinted: true });
    expect(hinted.save.readiness['1']!.at(-1)!.credit).toBe(CREDIT.hinted);
    const revealed = applySubmission(first.save, itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'y', at: 3, day: '2026-03-03', reviewing: true, revealed: true });
    expect(revealed.save.reviewRecent['1']).toEqual(['miss']);
    expect(revealed.save.readiness['1']!.at(-1)!.credit).toBe(0);
  });

  test('a failed review is a miss in the window and scores zero, while a learning failure touches neither', () => {
    const first = applySubmission(emptySave(), itemIndex, item('c1-i1'), REFERENCE, { passed: true, sql: 'x', at: 1, day: DAY });
    const failedReview = applySubmission(first.save, itemIndex, item('c1-i1'), REFERENCE, { passed: false, sql: 'y', at: 2, day: '2026-03-03', reviewing: true, tag: 'GE_VS_GT' });
    expect(failedReview.save.reviewRecent['1']).toEqual(['miss']);
    expect(failedReview.save.readiness['1']!.at(-1)!.credit).toBe(0);
    const learningFailure = applySubmission(first.save, itemIndex, item('c1-i1'), REFERENCE, { passed: false, sql: 'z', at: 3, day: DAY });
    expect(learningFailure.save.reviewRecent['1']).toBeUndefined();
    expect(learningFailure.save.readiness['1']).toHaveLength(1);
  });

  test('an appended mistake updates the competency totals', () => {
    const entry: MistakeEntry = { at: 1, day: DAY, itemId: 'c1-i1', competency: 1, tag: null, kind: 'revealed' };
    expect(appendMistake(emptySave(), entry).mistakeTotals.competencies).toEqual({ '1': 1 });
    expect(emptyProgress().passed).toBe(false);
  });
});
