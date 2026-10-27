import type { Challenge } from '../core/types';
import type { SaveV2 } from '../save/progress';

// Pure helpers for the chapter UI. Nothing here touches the engine or the DOM.
export interface ChapterSummary { chapterId: number; items: readonly Challenge[]; graded: number; passed: number; bossPassed: boolean; lessonsDone: number; lessonCount: number }

export function itemsForChapter(items: readonly Challenge[], chapterId: number): readonly Challenge[] {
  return items.filter((item) => item.chapterId === chapterId);
}

// Boss parts share a bossGroup. Each part is graded on its own; the boss passes when every part passes.
export function bossPartsOf(items: readonly Challenge[], group: string): readonly Challenge[] {
  return items.filter((item) => item.bossGroup === group);
}

export function partLabel(item: Challenge, items: readonly Challenge[]): string | undefined {
  if (!item.bossGroup) return undefined;
  const parts = bossPartsOf(items, item.bossGroup);
  return `Part ${parts.indexOf(item) + 1} of ${parts.length}`;
}

export function isPassed(save: Pick<SaveV2, 'tickets'>, id: string): boolean {
  return save.tickets[id]?.passed === true;
}

export function bossPassed(items: readonly Challenge[], save: Pick<SaveV2, 'tickets'>, group: string): boolean {
  const parts = bossPartsOf(items, group);
  return parts.length > 0 && parts.every((part) => isPassed(save, part.id));
}

export function summarizeChapter(items: readonly Challenge[], save: SaveV2, chapterId: number, sectionIds: readonly string[]): ChapterSummary {
  const chapterItems = itemsForChapter(items, chapterId);
  const groups = [...new Set(chapterItems.map((item) => item.bossGroup).filter((group): group is string => Boolean(group)))];
  const singles = chapterItems.filter((item) => !item.bossGroup);
  const bossesPassed = groups.filter((group) => bossPassed(items, save, group)).length;
  const passed = singles.filter((item) => isPassed(save, item.id)).length + bossesPassed;
  const lessonsDone = sectionIds.filter((id) => save.lessons[id]?.correct).length;
  return {
    chapterId, items: chapterItems, graded: singles.length + groups.length, passed,
    bossPassed: groups.length > 0 && bossesPassed === groups.length,
    lessonsDone, lessonCount: sectionIds.length,
  };
}

// Shuffles prediction options at render time. The ids are unchanged, so an answer is stored as an id, not a position.
export function shuffleOptions<T extends { id: string }>(options: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...options];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}
