import { describe, expect, test } from 'vitest';
import { items } from '../src/data/catalog';
import { bossPartsOf, bossPassed, partLabel, shuffleOptions, summarizeChapter } from '../src/app/model';
import { emptyLesson, emptyProgress, emptySave } from '../src/save/progress';

describe('chapter model', () => {
  test('boss parts are numbered in order and the boss passes only when every part passes', () => {
    const parts = bossPartsOf(items, 'c5-boss');
    expect(parts.map((part) => partLabel(part, items))).toEqual(parts.map((_, index) => `Part ${index + 1} of ${parts.length}`));
    const pass = (save: ReturnType<typeof emptySave>, id: string) => ({ ...save, tickets: { ...save.tickets, [id]: { ...emptyProgress(), passed: true, firstOutcome: 'first-try' as const, firstPassAt: 0, passedAt: 0 } } });
    let save = pass(emptySave(), parts[0]!.id);
    expect(bossPassed(items, save, 'c5-boss')).toBe(false);
    for (const part of parts) save = pass(save, part.id);
    expect(bossPassed(items, save, 'c5-boss')).toBe(true);
  });

  test('a boss group counts as one graded ticket, and lesson sections count when answered correctly', () => {
    const save = { ...emptySave(), lessons: { 'c5-s1': { ...emptyLesson(), read: true, answer: 'b', correct: true } } };
    const summary = summarizeChapter(items, save, 5, ['c5-s1', 'c5-s2', 'c5-s3']);
    // Chapter 5: three guided tickets, five independent tickets, and one boss group.
    expect(summary.graded).toBe(9);
    expect(summary.lessonsDone).toBe(1);
    expect(summary.lessonCount).toBe(3);
  });

  test('shuffle keeps every option and its id, and does not reorder the source list', () => {
    const options = [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }, { id: 'c', text: 'three' }];
    const shuffled = shuffleOptions(options, () => 0);
    expect(shuffled.map((option) => option.id).sort()).toEqual(['a', 'b', 'c']);
    expect(shuffled.map((option) => option.id)).not.toEqual(['a', 'b', 'c']);
    expect(options.map((option) => option.id)).toEqual(['a', 'b', 'c']);
  });
});
