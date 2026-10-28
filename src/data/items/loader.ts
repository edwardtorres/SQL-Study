import type { Challenge } from '../../core/types';
import { itemMetaById } from '../itemIndex';

// Full ticket definitions, loaded one chapter at a time. The app shell and the grading worker both use this
// module, so a chapter's references and wrong variants are downloaded only when that chapter is used.
type ChapterLoader = () => Promise<readonly Challenge[]>;

const samplesOf = async (chapterId: number): Promise<readonly Challenge[]> =>
  (await import('../challenges')).challenges.filter((challenge) => challenge.chapterId === chapterId);

const chapterLoaders: Readonly<Record<number, ChapterLoader>> = {
  1: async () => [...await samplesOf(1), ...(await import('./ch1')).chapter1Items],
  2: async () => (await import('./ch2')).chapter2Items,
  3: async () => [...await samplesOf(3), ...(await import('./ch3')).chapter3Items],
  4: async () => (await import('./ch4')).chapter4Items,
  5: async () => (await import('./ch5')).chapter5Items,
  6: async () => (await import('./ch6')).chapter6Items,
  7: async () => (await import('./ch7')).chapter7Items,
  8: async () => [...await samplesOf(8), ...(await import('./ch8')).chapter8Items],
  9: async () => (await import('./ch9')).chapter9Items,
  10: async () => (await import('./ch10')).chapter10Items,
  11: async () => (await import('./ch11')).chapter11Items,
  12: async () => (await import('./ch12')).chapter12Items,
  13: async () => (await import('./ch13')).chapter13Items,
};

const loaded = new Map<number, Promise<readonly Challenge[]>>();

// Every ticket of one chapter, samples included. Repeated calls share one load.
export function loadChapterItems(chapterId: number): Promise<readonly Challenge[]> {
  const existing = loaded.get(chapterId);
  if (existing) return existing;
  const loader = chapterLoaders[chapterId];
  if (!loader) return Promise.resolve([]);
  // A failed load is forgotten, so the next open retries it.
  const attempt = loader().catch((error: unknown) => {
    loaded.delete(chapterId);
    throw error;
  });
  loaded.set(chapterId, attempt);
  return attempt;
}

// One ticket by id. The index says which chapter holds it, so only that chapter's module loads.
export async function loadItem(id: string): Promise<Challenge> {
  const meta = itemMetaById(id);
  if (!meta) throw new Error(`Unknown ticket ${id}.`);
  const found = (await loadChapterItems(meta.chapterId)).find((item) => item.id === id);
  if (!found) throw new Error(`Ticket ${id} is not in chapter ${meta.chapterId}.`);
  return found;
}
