import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { items } from '../src/data/catalog';
import { itemIndex } from '../src/data/itemIndex';
import { loadChapterItems, loadItem } from '../src/data/items/loader';

// The app shell reads the light index; the grader and the chapter pages read the loaded definitions.
// These checks keep the two in step, and keep the full catalog out of the app shell and the worker.
describe('item index and chapter loading', () => {
  test('the index lists exactly the catalog, with the same chapter, role, title and starter', () => {
    const indexed = new Map(itemIndex.map((entry) => [entry.id, entry]));
    expect(indexed.size, 'duplicate index ids').toBe(itemIndex.length);
    expect([...indexed.keys()].sort()).toEqual(items.map((item) => item.id).sort());
    for (const item of items) {
      const entry = indexed.get(item.id)!;
      expect({ chapterId: entry.chapterId, role: entry.role, bossGroup: entry.bossGroup, title: entry.title, summary: entry.summary, colleague: entry.colleague, colleagueRole: entry.colleagueRole, starterStyle: entry.starterStyle, starterSql: entry.starterSql, estimatedMinutes: entry.estimatedMinutes }, item.id)
        .toEqual({ chapterId: item.chapterId, role: item.role, bossGroup: item.bossGroup, title: item.title, summary: item.summary, colleague: item.colleague, colleagueRole: item.colleagueRole, starterStyle: item.starterStyle, starterSql: item.starterSql, estimatedMinutes: item.estimatedMinutes });
    }
  });

  test('each chapter loads exactly its own tickets, and loadItem finds every ticket', async () => {
    const chapters = [...new Set(items.map((item) => item.chapterId))];
    for (const chapterId of chapters) {
      const loaded = (await loadChapterItems(chapterId)).map((item) => item.id).sort();
      const expected = items.filter((item) => item.chapterId === chapterId).map((item) => item.id).sort();
      expect(loaded, `chapter ${chapterId}`).toEqual(expected);
    }
    for (const item of items) {
      const found = await loadItem(item.id);
      expect(found.id).toBe(item.id);
    }
  });

  test('the app shell and the grading worker never import the full catalog', () => {
    const shell = ['src/app', 'src/engine'].flatMap((directory) =>
      readdirSync(directory).filter((name) => /\.(ts|tsx)$/.test(name)).map((name) => join(directory, name)));
    for (const file of shell) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} imports the full catalog`).not.toMatch(/from ['"][./]*data\/catalog['"]/);
      expect(source, `${file} imports a chapter module directly`).not.toMatch(/from ['"][./]*items\/ch\d['"]/);
    }
  });
});
