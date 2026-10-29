import { describe, expect, test } from 'vitest';
import { items as chapterItems } from '../src/data/catalog';
import { itemIndex } from '../src/data/itemIndex';
import { interviewItems } from '../src/data/interview';

// The interview reserve is kept apart from the chapters. These checks pin that separation and the set's shape; the
// reference, variant and hidden-dataset standards are checked for every item by tests/content.test.ts.
describe('interview reserve', () => {
  test('there are ten problems, each with a unique id and title, and each scores toward a real competency', () => {
    expect(interviewItems).toHaveLength(10);
    expect(new Set(interviewItems.map((item) => item.id)).size).toBe(10);
    expect(new Set(interviewItems.map((item) => item.title)).size).toBe(10);
    for (const item of interviewItems) {
      expect(item.id, `${item.id} id`).toMatch(/^int-\d{2}$/);
      expect(item.role, `${item.id} role`).toBe('independent');
      expect(item.chapterId, `${item.id} competency`).toBeGreaterThanOrEqual(1);
      expect(item.chapterId, `${item.id} competency`).toBeLessThanOrEqual(13);
    }
  });

  test('every problem has a whole-minute estimate and a total the set can use', () => {
    for (const item of interviewItems) {
      expect(Number.isInteger(item.estimatedMinutes), `${item.id} estimatedMinutes`).toBe(true);
      expect(item.estimatedMinutes ?? 0, `${item.id} estimatedMinutes`).toBeGreaterThanOrEqual(3);
      expect(item.estimatedMinutes ?? 0, `${item.id} estimatedMinutes`).toBeLessThanOrEqual(10);
    }
  });

  test('no problem is in the chapter index or repeats a chapter ticket’s title', () => {
    const indexed = new Set(itemIndex.map((item) => item.id));
    const chapterTitles = new Set(chapterItems.map((item) => item.title));
    for (const item of interviewItems) {
      expect(indexed.has(item.id), `${item.id} must not be in the chapter index`).toBe(false);
      expect(chapterTitles.has(item.title), `${item.id} title repeats a chapter ticket`).toBe(false);
    }
  });
});
