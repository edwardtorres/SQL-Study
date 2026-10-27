import { PGlite } from '@electric-sql/pglite';
import { describe, expect, test } from 'vitest';
import { mistakeTags } from '../src/core/types';
import type { Challenge } from '../src/core/types';
import { items } from '../src/data/catalog';
import { datasetCatalog, sampleDataset, seedSql } from '../src/data';
import { lessons } from '../src/data/lessons';
import citations from '../src/data/citations.json';
import { isBareSkeleton } from '../src/grader/skeleton';
import { sameRows } from '../src/grader/compare';
import { parsedStatements } from '../src/grader/structure';

// The content check: every graded item must satisfy the Step 2 rules before it ships.
// Wrong variants are measured against the engine on every dataset the item uses.

const bossGroups = new Map<string, Challenge[]>();
for (const item of items) {
  if (item.bossGroup) bossGroups.set(item.bossGroup, [...(bossGroups.get(item.bossGroup) ?? []), item]);
}

describe('content check: graded items', () => {
  test('ids are unique and every item names a known chapter', () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size, 'duplicate item ids').toBe(ids.length);
    for (const item of items) expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], item.id).toContain(item.chapterId);
  });

  test('each boss ticket has two to four parts that are numbered and titled', () => {
    for (const [group, parts] of bossGroups) {
      expect(parts.length, `${group} parts`).toBeGreaterThanOrEqual(2);
      expect(parts.length, `${group} parts`).toBeLessThanOrEqual(4);
      for (const part of parts) expect(part.role, part.id).toBe('boss');
    }
  });

  test('hint tiers, mistake tags, and two wrong variants for every item', () => {
    for (const item of items) {
      expect(item.hints, `${item.id} hints`).toHaveLength(3);
      for (const hint of item.hints) expect(hint.trim().length, `${item.id} hint`).toBeGreaterThan(0);
      if (item.role === 'sample') continue;
      expect(item.wrongVariants.length, `${item.id} wrong variants`).toBeGreaterThanOrEqual(2);
      for (const variant of item.wrongVariants) {
        expect(mistakeTags, `${item.id}/${variant.id} tag`).toContain(variant.mistake);
        expect(variant.explanation.trim().length, `${item.id}/${variant.id} explanation`).toBeGreaterThan(20);
      }
    }
  });

  test('every graded item has at least two hidden datasets besides the visible sample', () => {
    for (const item of items) {
      if (item.role === 'sample') continue;
      const hidden = item.datasets.filter((dataset) => dataset.hidden);
      expect(hidden.length, `${item.id} hidden datasets`).toBeGreaterThanOrEqual(2);
      expect(item.datasets[0]?.id, `${item.id} starts with the visible sample`).toBe('sample');
    }
  });

  test('write-query starters are bare skeletons; guided starters keep their blanks', async () => {
    for (const item of items) {
      if (item.kind === 'write' || item.kind === 'window') {
        expect(await isBareSkeleton(item.starterSql), `${item.id} starter must be a bare skeleton`).toBe(true);
      }
      if (item.kind === 'guided') expect(item.starterSql, `${item.id} guided blanks`).toContain('____');
    }
  });
});

describe('content check: references and wrong variants on the engine', () => {
  test('every reference runs on every dataset, matches its column contract, and every wrong variant is caught by at least two datasets', async () => {
    const db = await PGlite.create();
    try {
      for (const dataset of datasetCatalog) {
        await db.exec(`CREATE SCHEMA check_${dataset.id}; SET search_path TO check_${dataset.id};`);
        await db.exec(seedSql(dataset.seed, dataset.variant));
      }
      const failures: string[] = [];
      for (const item of items) {
        const caught = new Map<string, number>();
        // The visible sample must separate at least one wrong variant, so a learner can see a wrong answer without hidden data.
        const visibleCatches = new Set<string>();
        for (const dataset of item.datasets) {
          await db.exec(`SET search_path TO check_${dataset.id};`);
          const reference = await db.query(item.referenceSql, [], { rowMode: 'array' }).catch((error: unknown) => {
            failures.push(`${item.id} reference errors on ${dataset.id}: ${String(error)}`);
            return null;
          });
          if (!reference) continue;
          const columns = reference.fields.map((field) => `${field.name}:${field.dataTypeID}`).join(',');
          const contract = item.columns.map((column) => `${column.name}:${column.type}`).join(',');
          if (columns !== contract) failures.push(`${item.id} columns ${columns} do not match ${contract}`);
          for (const variant of item.wrongVariants) {
            const key = variant.id;
            const wrong = await db.query(variant.sql, [], { rowMode: 'array' }).catch((error: unknown) => {
              failures.push(`${item.id}/${variant.id} errors on ${dataset.id}: ${String(error)}`);
              return null;
            });
            if (!wrong) continue;
            const same = sameRows({ fields: reference.fields, rows: reference.rows as unknown[][] }, { fields: wrong.fields, rows: wrong.rows as unknown[][] }, item.ordered);
            if (!same) caught.set(key, (caught.get(key) ?? 0) + 1);
            if (!same && dataset.id === 'sample') visibleCatches.add(key);
            else caught.set(key, caught.get(key) ?? 0);
          }
        }
        if (visibleCatches.size === 0) failures.push(`${item.id} has no wrong variant that fails on the visible sample`);
        for (const variant of item.wrongVariants) {
          const count = caught.get(variant.id) ?? 0;
          if (count < 2) failures.push(`${item.id}/${variant.id} (${variant.mistake}) caught by ${count} dataset(s); need at least 2`);
        }
      }
      expect(failures).toEqual([]);
    } finally {
      await db.close();
    }
  }, 120_000);
});

describe('content check: lessons', () => {
  test('every example runs read-only on the visible sample, and each predict answer equals the engine row count', async () => {
    const db = await PGlite.create();
    try {
      await db.exec(`CREATE SCHEMA lesson_sample; SET search_path TO lesson_sample;`);
      await db.exec(seedSql(sampleDataset.seed, sampleDataset.variant));
      for (const lesson of lessons) {
        for (const section of lesson.sections) {
          await parsedStatements(section.example, { mode: 'read' });
          const result = await db.query(section.example);
          expect(result.rows.length, `${section.id} predict answerRows`).toBe(section.predict.answerRows);
          const answers = section.predict.options.filter((option) => option.id === section.predict.answer);
          expect(answers, `${section.id} answer id`).toHaveLength(1);
          expect(new Set(section.predict.options.map((option) => option.id)).size, `${section.id} option ids`).toBe(section.predict.options.length);
          // Claims without a verbatim quote are shown as engine demonstrations; each must run on the visible sample.
          for (const demonstration of section.demonstrations ?? []) {
            await parsedStatements(demonstration.sql, { mode: 'read' });
            await db.query(demonstration.sql).catch((error: unknown) => { throw new Error(`${section.id} demonstration failed: ${String(error)}`); });
          }
          for (const mistake of section.commonMistakes) expect(mistakeTags, `${section.id} mistake`).toContain(mistake.mistake);
          for (const id of section.citations) expect(citations.some((citation) => citation.id === id), `${section.id} citation ${id}`).toBe(true);
        }
      }
    } finally {
      await db.close();
    }
  }, 60_000);
});

describe('content check: parsed statements', () => {
  test('every reference is one statement with no transaction or session escapes', async () => {
    for (const item of items) {
      const statements = await parsedStatements(item.referenceSql, { mode: 'read' });
      expect(statements.length, item.id).toBe(1);
    }
  });
});
