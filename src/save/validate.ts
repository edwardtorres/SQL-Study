import type { LessonProgress } from './format';

// Shared checks for every save version. A value that fails one throws, and the caller reports the save as corrupt.
export const ID = /^[a-z][a-z0-9-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
export const stamp = (value: unknown): value is number => integer(value, Number.MAX_SAFE_INTEGER);
export const stampOrNull = (value: unknown): value is number | null => value === null || stamp(value);
export const day = (value: unknown): value is string => typeof value === 'string' && DAY.test(value);
export const dayOrNull = (value: unknown): value is string | null => value === null || day(value);

const validLesson = (value: unknown): value is LessonProgress => object(value)
  && typeof value.read === 'boolean' && typeof value.correct === 'boolean'
  && (value.answer === null || (typeof value.answer === 'string' && /^[a-z]{1,4}$/.test(value.answer)));

export function readLessons(value: Record<string, unknown>): Record<string, LessonProgress> {
  const lessons: Record<string, LessonProgress> = {};
  for (const [id, lesson] of Object.entries(value)) {
    if (!ID.test(id) || !validLesson(lesson)) throw new Error('Invalid lesson');
    lessons[id] = { ...lesson };
  }
  return lessons;
}

export function readActive(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && ID.test(value)) return value;
  throw new Error('Invalid active ticket');
}
