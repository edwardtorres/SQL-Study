import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { sampleDataset, seedSql } from '../src/data';
import { validateSql } from '../src/grader/structure';
import { WarmEngine, type StateOptions } from '../src/engine/runtime';

// Engine features added for chapters 10 to 13: idempotency runs, planner nodes, and the EXPLAIN ANALYZE refusal.
describe('engine features for chapters 10 to 13', () => {
  let engine: WarmEngine;

  beforeAll(async () => {
    engine = await WarmEngine.create();
    await engine.prepare(sampleDataset, seedSql(sampleDataset.seed, sampleDataset.variant));
  });

  afterAll(async () => {
    await engine.close();
  });

  const customersCheck = [{ id: 'customers', label: 'Customers', sql: 'SELECT id, name, region FROM customers ORDER BY id' }];

  test('an idempotent statement leaves the same state after its second run', async () => {
    const options: StateOptions = { allow: ['InsertStmt'], transactions: false, checks: customersCheck, tests: [], runs: 2 };
    const result = await engine.runState(sampleDataset.id, "INSERT INTO customers (id, name, region) VALUES (9, 'Juniper Crate', 'North') ON CONFLICT (id) DO NOTHING;", options);
    expect(result.learnerError).toBeNull();
    expect(result.rerunChecks).toBeDefined();
    expect(result.rerunChecks![0]!.result!.rows).toEqual(result.checks[0]!.result!.rows);
  });

  test('a statement that is not idempotent fails when it runs a second time', async () => {
    const options: StateOptions = { allow: ['InsertStmt'], transactions: false, checks: customersCheck, tests: [], runs: 2 };
    const result = await engine.runState(sampleDataset.id, "INSERT INTO customers (id, name, region) VALUES (9, 'Juniper Crate', 'North');", options);
    expect(result.learnerError).toMatch(/Running the statements a second time failed/);
  });

  test('a second run repeats the load, not the table definition it creates', async () => {
    const options: StateOptions = { allow: ['CreateStmt', 'InsertStmt'], transactions: false, checks: [], tests: [], runs: 2 };
    const result = await engine.runState(sampleDataset.id, 'CREATE TABLE rerun_probe (id integer PRIMARY KEY);\nINSERT INTO rerun_probe (id) VALUES (1) ON CONFLICT (id) DO NOTHING;', options);
    expect(result.learnerError).toBeNull();
  });

  test('a ticket that runs twice may not also set transactions', async () => {
    const options: StateOptions = { allow: ['InsertStmt'], transactions: true, checks: customersCheck, tests: [], runs: 2 };
    await expect(engine.runState(sampleDataset.id, 'SELECT 1;', options)).rejects.toThrow(/cannot also set transactions/);
  });

  test('a primary-key lookup on the large scans table uses an index scan, and a wrapped column does not', async () => {
    const indexed = await engine.planNodes(sampleDataset.id, 'SELECT * FROM shipment_scans_large WHERE id = 42');
    expect(indexed).toContain('Index Scan');
    expect(indexed).not.toContain('Seq Scan');
    const wrapped = await engine.planNodes(sampleDataset.id, 'SELECT * FROM shipment_scans_large WHERE shipment_id + 0 = 42');
    expect(wrapped).toContain('Seq Scan');
  });

  test('EXPLAIN without ANALYZE is allowed for a ticket that allows it; EXPLAIN ANALYZE is refused', async () => {
    await expect(validateSql('EXPLAIN SELECT 1', { mode: 'write', allow: ['ExplainStmt'] })).resolves.toBeUndefined();
    await expect(validateSql('EXPLAIN ANALYZE SELECT 1', { mode: 'write', allow: ['ExplainStmt'] })).rejects.toThrow(/EXPLAIN ANALYZE runs the query/);
    await expect(validateSql('EXPLAIN (ANALYZE) SELECT 1', { mode: 'write', allow: ['ExplainStmt'] })).rejects.toThrow(/EXPLAIN ANALYZE runs the query/);
  });
});
