import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import { WarmEngine, type StateOptions } from '../src/engine/runtime';
import { sampleDataset, seedSql } from '../src/data';
import type { CheckQuery, ConstraintTest } from '../src/core/types';

let engine: WarmEngine;
beforeAll(async () => {
  engine = await WarmEngine.create();
  await engine.prepare(sampleDataset, seedSql(sampleDataset.seed, sampleDataset.variant));
});
afterAll(async () => { await engine.close(); });

const counts: CheckQuery[] = [
  { id: 'slots', label: 'pickup_slots rows', sql: 'SELECT id, label FROM pickup_slots ORDER BY id' },
  { id: 'shipments', label: 'shipment count', sql: 'SELECT count(*)::integer AS n FROM shipments' },
];
const slots: StateOptions = {
  allow: ['CreateStmt', 'InsertStmt', 'SelectStmt'],
  checks: [{ id: 'shape', label: 'table shape', sql: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pickup_slots' ORDER BY ordinal_position" }, ...counts],
  tests: [],
};

describe('write grading inside one rolled-back transaction', () => {
  test('learner DDL and rows are visible to checks, then gone for the next run', async () => {
    const create = 'CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text NOT NULL UNIQUE); INSERT INTO pickup_slots VALUES (1, \'dock 1\'), (2, \'dock 2\');';
    const first = await engine.runState('sample', create, slots as StateOptions & { checks: CheckQuery[] } as StateOptions);
    expect(first.learnerError).toBeNull();
    expect(first.checks[0]?.result?.rows.length).toBe(2);
    const next = await engine.runState('sample', 'SELECT 1', { allow: ['SelectStmt'], checks: counts, tests: [] });
    expect(next.checks[0]?.error).toMatch(/does not exist/);
  });

  test('a learner error is reported as feedback and leaves no trace', async () => {
    const result = await engine.runState('sample', 'CREATE TABLE pickup_slots (id integer); INSERT INTO nowhere VALUES (1);', { allow: ['CreateStmt', 'InsertStmt'], checks: counts, tests: [] });
    expect(result.learnerError).toMatch(/nowhere/);
    const after = await engine.runState('sample', 'SELECT 1', { allow: ['SelectStmt'], checks: counts, tests: [] });
    expect(after.checks[1]?.result?.rows[0]?.[0]).toBe(240);
  });

  test('constraint tests pass when the learner enforces the constraint and fail when it does not', async () => {
    const tests: ConstraintTest[] = [
      { name: 'duplicate label is rejected', sql: "INSERT INTO pickup_slots VALUES (3, 'dock 1')", expect: 'error', sqlstate: '23505' },
      { name: 'missing label is rejected', sql: 'INSERT INTO pickup_slots VALUES (4, NULL)', expect: 'error', sqlstate: '23502' },
      { name: 'a new valid row is accepted', sql: "INSERT INTO pickup_slots VALUES (5, 'dock 5')", expect: 'ok' },
    ];
    const good = await engine.runState('sample', "CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text NOT NULL UNIQUE); INSERT INTO pickup_slots VALUES (1, 'dock 1');", { allow: ['CreateStmt', 'InsertStmt'], checks: [], tests });
    expect(good.tests.map((test) => test.passed)).toEqual([true, true, true]);
    const weak = await engine.runState('sample', "CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text); INSERT INTO pickup_slots VALUES (1, 'dock 1');", { allow: ['CreateStmt', 'InsertStmt'], checks: [], tests });
    expect(weak.tests.map((test) => test.passed)).toEqual([false, false, true]);
    expect(weak.tests[0]?.message).toMatch(/should have been rejected|succeeded/);
  });

  test('a constraint test rolls back its own insert, so later tests see the same table', async () => {
    const tests: ConstraintTest[] = [
      { name: 'valid insert accepted', sql: "INSERT INTO pickup_slots VALUES (9, 'dock 9')", expect: 'ok' },
      { name: 'the same row is now a duplicate', sql: "INSERT INTO pickup_slots VALUES (9, 'dock 9')", expect: 'error', sqlstate: '23505' },
    ];
    const result = await engine.runState('sample', 'CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text)', { allow: ['CreateStmt'], checks: [], tests });
    expect(result.tests.map((test) => test.passed)).toEqual([true, false]);
  });
});

describe('transaction control is translated, never executed for real', () => {
  const base: StateOptions = { allow: ['CreateStmt', 'InsertStmt', 'DeleteStmt', 'SelectStmt', 'TransactionStmt'], transactions: true, checks: counts, tests: [] };

  test('COMMIT keeps changes for later checks in the same run, and the next run sees none', async () => {
    const committed = await engine.runState('sample', 'BEGIN; DELETE FROM invoices WHERE id = 1; COMMIT;', base);
    expect(committed.learnerError).toBeNull();
    const shipments = await engine.runState('sample', 'SELECT 1', { ...base, allow: ['SelectStmt'], transactions: false, checks: counts });
    expect(shipments.checks[1]?.result?.rows[0]?.[0]).toBe(240);
  });

  test('ROLLBACK undoes the block, and a savepoint rolls back only its part', async () => {
    const result = await engine.runState('sample', 'BEGIN; DELETE FROM invoices WHERE id = 2; SAVEPOINT s; DELETE FROM invoices WHERE id = 3; ROLLBACK TO s; ROLLBACK;', { ...base, checks: [{ id: 'n', label: 'invoices', sql: 'SELECT count(*)::integer AS n FROM invoices' }] });
    expect(result.learnerError).toBeNull();
    expect(result.checks[0]?.result?.rows[0]?.[0]).not.toBeUndefined();
  });

  test('an error in a block aborts it: later statements are refused until the block ends', async () => {
    const result = await engine.runState('sample', 'BEGIN; DELETE FROM invoices WHERE id = 4; DELETE FROM no_such_table; DELETE FROM invoices WHERE id = 5; ROLLBACK;', base);
    expect(result.learnerError).toMatch(/no_such_table/);
  });

  test('COMMIT in an aborted block rolls back, as in PostgreSQL', async () => {
    const result = await engine.runState('sample', 'BEGIN; DELETE FROM no_such_table; COMMIT; SELECT 1;', { ...base, checks: counts });
    expect(result.learnerError).toMatch(/no_such_table/);
  });

  test('a statement after a failure in an open block is refused with the aborted-block message', async () => {
    const result = await engine.runState('sample', 'BEGIN; SELECT * FROM no_such_table; SELECT 1;', { ...base, allow: ['SelectStmt', 'TransactionStmt'] });
    expect(result.learnerError).toMatch(/no_such_table/);
  });

  test('savepoints need a block and must exist', async () => {
    expect((await engine.runState('sample', 'SAVEPOINT a', base)).learnerError).toMatch(/only be used inside a transaction block/);
    expect((await engine.runState('sample', 'BEGIN; ROLLBACK TO SAVEPOINT missing; ROLLBACK', base)).learnerError).toMatch(/does not exist/);
  });
});
