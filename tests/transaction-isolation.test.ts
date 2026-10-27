// Proof that transaction-mode runs leave no trace: after any learner program, a probe run sees the baseline.
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { WarmEngine, type StateOptions } from '../src/engine/runtime';
import { sampleDataset, seedSql } from '../src/data';
import type { CheckQuery } from '../src/core/types';

let engine: WarmEngine;
beforeAll(async () => {
  engine = await WarmEngine.create();
  await engine.prepare(sampleDataset, seedSql(sampleDataset.seed, sampleDataset.variant));
});
afterAll(async () => { await engine.close(); });

const fingerprint: CheckQuery[] = [
  { id: 'invoices', label: 'invoice count and sum', sql: 'SELECT count(*)::integer AS n, sum(amount)::text AS total FROM invoices' },
  { id: 'shipments', label: 'shipment count', sql: 'SELECT count(*)::integer AS n FROM shipments' },
  { id: 'events', label: 'event count', sql: 'SELECT count(*)::integer AS n FROM shipment_events' },
];
const base: StateOptions = { allow: ['InsertStmt', 'UpdateStmt', 'DeleteStmt', 'SelectStmt', 'TransactionStmt'], transactions: true, checks: fingerprint, tests: [] };
const probeOptions: StateOptions = { allow: ['SelectStmt'], checks: fingerprint, tests: [] };

async function probe(): Promise<string> {
  const result = await engine.runState('sample', 'SELECT 1', probeOptions);
  if (result.learnerError) throw new Error(`probe failed: ${result.learnerError}`);
  return JSON.stringify(result.checks.map((check) => check.result?.rows ?? check.error));
}

// A seeded generator keeps the 200 programs reproducible.
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const kinds = [
  () => 'BEGIN;', () => 'COMMIT;', () => 'ROLLBACK;', () => 'START TRANSACTION;', () => 'END;',
  (n: () => number) => `SAVEPOINT s${Math.floor(n() * 3)};`,
  (n: () => number) => `ROLLBACK TO SAVEPOINT s${Math.floor(n() * 3)};`,
  (n: () => number) => `RELEASE SAVEPOINT s${Math.floor(n() * 3)};`,
  (n: () => number) => `DELETE FROM invoices WHERE id = ${1 + Math.floor(n() * 40)};`,
  (n: () => number) => `UPDATE invoices SET amount = amount + 1 WHERE id = ${1 + Math.floor(n() * 40)};`,
  (n: () => number) => `INSERT INTO invoices (id, shipment_id, amount, issued_at) VALUES (${9000 + Math.floor(n() * 50)}, 1, 1.00, '2026-01-01T00:00:00Z');`,
  (n: () => number) => `DELETE FROM shipment_events WHERE id = ${1 + Math.floor(n() * 30)};`,
  () => 'DELETE FROM no_such_table;',
  () => 'SELECT 1 / 0;',
];

describe('transaction-mode runs leave no trace', () => {
  test('the baseline is stable before any program runs', async () => {
    expect(await probe()).toBe(await probe());
  });

  test('200 seeded random programs mixing BEGIN, COMMIT, ROLLBACK, savepoints, DML and errors', async () => {
    const baseline = await probe();
    const next = random(20260217);
    for (let program = 0; program < 200; program += 1) {
      const length = 1 + Math.floor(next() * 8);
      const statements: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const pick = kinds[Math.floor(next() * kinds.length)]!;
        statements.push(pick(next));
      }
      const sql = statements.join(' ');
      await engine.runState('sample', sql, base).catch(() => undefined);
      expect(await probe(), `program ${program}: ${sql}`).toBe(baseline);
    }
  }, 120_000);

  test('a COMMIT inside a learner block is visible only inside that run', async () => {
    const baseline = await probe();
    const committed = await engine.runState('sample', 'BEGIN; DELETE FROM invoices WHERE id = 7; COMMIT;', { ...base, checks: [fingerprint[0]!] });
    expect(committed.learnerError).toBeNull();
    expect(await probe()).toBe(baseline);
  });

  // Deadlines are tested end to end in the browser, where the worker can be terminated. A CPU-bound
  // statement would block this test thread, so it is not run here.
});
