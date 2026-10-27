import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WarmEngine, type StateOptions } from '../src/engine/runtime';
import { stateDiff } from '../src/grader/state';
import { sampleDataset, seedSql } from '../src/data';
import type { CheckQuery, ConstraintTest } from '../src/core/types';

let engine: WarmEngine;
beforeAll(async () => {
  engine = await WarmEngine.create();
  await engine.prepare(sampleDataset, seedSql(sampleDataset.seed, sampleDataset.variant));
});
afterAll(async () => { await engine.close(); });

const slotChecks: CheckQuery[] = [
  { id: 'columns', label: 'table shape', sql: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pickup_slots' ORDER BY ordinal_position" },
  { id: 'rows', label: 'pickup slot rows', sql: 'SELECT id, label FROM pickup_slots ORDER BY id' },
];
const slotTests: ConstraintTest[] = [
  { name: 'duplicate label is rejected', sql: "INSERT INTO pickup_slots VALUES (3, 'dock 1')", expect: 'error', sqlstate: '23505' },
  { name: 'missing label is rejected', sql: 'INSERT INTO pickup_slots VALUES (4, NULL)', expect: 'error', sqlstate: '23502' },
];
const reference = "CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text NOT NULL UNIQUE); INSERT INTO pickup_slots VALUES (1, 'dock 1'), (2, 'dock 2');";
const slotOptions: StateOptions = { allow: ['CreateStmt', 'InsertStmt'], checks: slotChecks, tests: slotTests };

async function gradeAgainst(learner: string, options: StateOptions, expected = reference) {
  const actual = await engine.runState('sample', learner, options);
  const wanted = await engine.runState('sample', expected, options);
  return stateDiff(actual, wanted);
}

describe('write feedback names the failing check or constraint', () => {
  test('a learner who enforces both constraints matches the reference', async () => {
    const diff = await gradeAgainst(reference, slotOptions);
    expect(diff).toMatchObject({ passed: true });
  });

  test('a learner missing UNIQUE fails the duplicate-label constraint test by name', async () => {
    const learner = "CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text NOT NULL); INSERT INTO pickup_slots VALUES (1, 'dock 1'), (2, 'dock 2');";
    const diff = await gradeAgainst(learner, slotOptions);
    expect(diff.passed).toBe(false);
    expect(diff.message).toMatch(/Constraint "duplicate label is rejected"/);
    expect(diff.message).not.toMatch(/missing label/);
  });

  test('a learner whose rows differ fails the rows check with an example', async () => {
    const learner = "CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text NOT NULL UNIQUE); INSERT INTO pickup_slots VALUES (1, 'dock 1');";
    const diff = await gradeAgainst(learner, slotOptions);
    expect(diff.passed).toBe(false);
    expect(diff.message).toMatch(/pickup slot rows/);
    expect(diff.missing.length).toBeGreaterThan(0);
  });

  test('a statement the validator refuses throws before anything runs', async () => {
    await expect(gradeAgainst('CREATE TABLE pickup_slots (id integer, label text) WITH (fillfactor = 10)', slotOptions)).rejects.toThrow(/Storage/);
  });

  test('a runtime error in the learner statements is shown as feedback, not as a check failure', async () => {
    const diff = await gradeAgainst("CREATE TABLE pickup_slots (id integer PRIMARY KEY, label text NOT NULL UNIQUE); INSERT INTO pickup_slots VALUES (1, NULL);", slotOptions);
    expect(diff.passed).toBe(false);
    expect(diff.message).toMatch(/null value/);
  });
});

describe('transaction-mode tickets: the checks see the learner state before the run ends', () => {
  const checks: CheckQuery[] = [{ id: 'shipments', label: 'shipments', sql: 'SELECT count(*)::integer AS n FROM shipments' }];
  const options: StateOptions = { allow: ['DeleteStmt', 'SelectStmt', 'TransactionStmt'], transactions: true, checks, tests: [] };

  test('a learner who deletes and rolls back matches the reference that rolls back', async () => {
    const diff = await gradeAgainst('BEGIN; DELETE FROM shipments WHERE id = 1; ROLLBACK;', options, 'BEGIN; DELETE FROM shipments WHERE id = 1; ROLLBACK;');
    expect(diff.passed).toBe(true);
  });

  test('a learner who deletes without ROLLBACK differs from the reference, because the checks see the deletion', async () => {
    const diff = await gradeAgainst('DELETE FROM shipments WHERE id = 1;', options, 'BEGIN; DELETE FROM shipments WHERE id = 1; ROLLBACK;');
    expect(diff.passed).toBe(false);
    expect(diff.message).toMatch(/shipments/);
  });
});
