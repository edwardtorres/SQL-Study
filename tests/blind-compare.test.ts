import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { items as catalogItems } from '../src/data/catalog';
import { interviewItems } from '../src/data/interview';
import { datasetCatalog, seedSql, reviewSamples } from '../src/data';
import { sameRows } from '../src/grader/compare';
import { readPolicy } from '../src/grader/policy';
import { validateSql } from '../src/grader/structure';
import { sameState } from '../src/grader/state';
import { WarmEngine, type StateOptions } from '../src/engine/runtime';

// The blind-solve rule (CLAUDE.md): a fresh solver's SQL must agree with each item's reference on every
// dataset the item uses. Every record under docs/reviews/blind/ is compared; compare.json files are output.
const BLIND_ROOT = 'docs/reviews/blind';

function blindRecords(directory: string): { id: string; solutionSql: string; file: string }[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return blindRecords(path);
    if (!name.endsWith('.json') || name === 'compare.json') return [];
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { id?: unknown; solutionSql?: unknown; superseded?: unknown };
    // A record superseded by a re-solve after a wording or reference change stays as history but is not compared.
    if (parsed.superseded !== undefined) return [];
    if (typeof parsed.id !== 'string' || typeof parsed.solutionSql !== 'string') return [];
    return [{ id: parsed.id, solutionSql: parsed.solutionSql, file: path }];
  });
}

describe('blind-solve agreement', () => {
  test('every blind solution agrees with its reference on every dataset its ticket uses', async () => {
    const records = blindRecords(BLIND_ROOT);
    // The interview reserve is compared too: a set can only ship with blind solutions that agree with it.
    const items = [...catalogItems, ...interviewItems];
    const byId = new Map(items.map((item) => [item.id, item]));
    const unknown = records.filter((record) => !byId.has(record.id)).map((record) => `${record.file}: no item ${record.id}`);
    expect(unknown, 'blind records must name an existing item').toEqual([]);
    // Coverage: every independent, boss and sample item needs a blind solution before it ships.
    const solved = new Set(records.map((record) => record.id));
    const uncovered = items.filter((item) => item.role !== 'guided' && !solved.has(item.id)).map((item) => item.id);
    expect(uncovered, 'independent, boss and sample items need a blind solution').toEqual([]);

    const engine = await WarmEngine.create();
    const db = await PGlite.create();
    const failures: string[] = [];
    try {
      for (const dataset of [...datasetCatalog, ...reviewSamples]) {
        await engine.prepare(dataset, seedSql(dataset.seed, dataset.variant));
        await db.exec(`CREATE SCHEMA blind_${dataset.id}; SET search_path TO blind_${dataset.id};`);
        await db.exec(seedSql(dataset.seed, dataset.variant));
      }
      for (const record of records) {
        const item = byId.get(record.id)!;
        if (item.checks) {
          const policy = item.policy ?? readPolicy;
          const transactions = policy.transactions ?? false;
          const options: StateOptions = { allow: policy.allow, transactions, checks: item.checks, tests: item.constraintTests ?? [] };
          try { await validateSql(record.solutionSql, { mode: 'write', allow: policy.allow, transactions }); }
          catch (error) { failures.push(`${record.id}: breaks the policy: ${String(error)}`); continue; }
          for (const dataset of [...item.datasets, ...reviewSamples]) {
            const expected = await engine.runState(dataset.id, item.referenceSql, options);
            const actual = await engine.runState(dataset.id, record.solutionSql, options);
            if (!sameState(expected, actual)) failures.push(`${record.id}: state differs from the reference on ${dataset.id}`);
          }
        } else {
          for (const dataset of [...item.datasets, ...reviewSamples]) {
            await db.exec(`SET search_path TO blind_${dataset.id};`);
            try {
              const expected = await db.query(item.referenceSql, [], { rowMode: 'array' });
              const actual = await db.query(record.solutionSql, [], { rowMode: 'array' });
              const columns = actual.fields.map((field) => `${field.name}:${field.dataTypeID}`).join(',');
              const contract = item.columns.map((column) => `${column.name}:${column.type}`).join(',');
              if (columns !== contract) failures.push(`${record.id}: columns ${columns} do not match ${contract}`);
              const same = sameRows({ fields: expected.fields, rows: expected.rows as unknown[][] }, { fields: actual.fields, rows: actual.rows as unknown[][] }, item.ordered);
              if (!same) failures.push(`${record.id}: rows differ from the reference on ${dataset.id}`);
            } catch (error) {
              failures.push(`${record.id}: errors on ${dataset.id}: ${String(error).slice(0, 160)}`);
            }
          }
        }
      }
    } finally {
      await engine.close();
      await db.close();
    }
    expect(failures).toEqual([]);
  }, 600_000);
});
