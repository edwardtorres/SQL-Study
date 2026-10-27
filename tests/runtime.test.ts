import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DatasetSpec } from '../src/core/types';
import { WarmEngine } from '../src/engine/runtime';

const sample: DatasetSpec = { id: 'runtime_sample', label: 'Sample', hidden: false, seed: 7, variant: 'sample' };
const hidden: DatasetSpec = { id: 'runtime_hidden', label: 'Hidden', hidden: true, seed: 9, variant: 'ties' };
const seed = 'CREATE TABLE points (id integer PRIMARY KEY, score integer NOT NULL CHECK (score >= 0)); INSERT INTO points VALUES (1, 10), (2, 20);';

describe('warm transactional execution', () => {
  let engine: WarmEngine;
  beforeAll(async () => {
    engine = await WarmEngine.create();
    await engine.prepare(sample, seed);
    await engine.prepare(hidden, 'CREATE TABLE points (id integer PRIMARY KEY, score integer); INSERT INTO points VALUES (1, 99);');
  }, 30_000);
  afterAll(async () => { await engine?.close(); });

  test('returns array rows with names and PostgreSQL type IDs', async () => {
    expect(await engine.run(sample.id, 'SELECT id, score FROM points ORDER BY id')).toEqual({
      fields: [{ name: 'id', dataTypeID: 23 }, { name: 'score', dataTypeID: 23 }],
      rows: [[1, 10], [2, 20]],
    });
  });

  test('CREATE TABLE and its INSERT leave no trace for the next run', async () => {
    const result = await engine.run(sample.id,
      'CREATE TABLE scratch (id integer); INSERT INTO scratch VALUES (42); SELECT id FROM scratch;',
      { mode: 'schema' });
    expect(result.rows).toEqual([[42]]);
    await expect(engine.run(sample.id, 'SELECT * FROM scratch')).rejects.toThrow(/does not exist/);
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
  });

  test('INSERT into a retained table rolls back', async () => {
    expect((await engine.run(sample.id,
      'INSERT INTO points VALUES (3, 30); SELECT count(*)::integer AS total FROM points;',
      { mode: 'schema' })).rows).toEqual([[3]]);
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
  });

  test('DROP TABLE rolls back and leaves the next reference intact', async () => {
    await engine.run(sample.id, 'DROP TABLE points;', { mode: 'schema' });
    expect((await engine.run(sample.id, 'SELECT score FROM points ORDER BY id')).rows).toEqual([[10], [20]]);
  });

  test('UPDATE and DELETE effects roll back', async () => {
    await engine.run(sample.id, 'UPDATE points SET score = 0; DELETE FROM points WHERE id = 1;', { mode: 'schema' });
    expect((await engine.run(sample.id, 'SELECT score FROM points ORDER BY id')).rows).toEqual([[10], [20]]);
  });

  test('constraint errors roll back earlier changes and recover without rebuilding', async () => {
    await expect(engine.run(sample.id,
      'INSERT INTO points VALUES (3, 30); INSERT INTO points VALUES (4, -1);',
      { mode: 'schema' })).rejects.toThrow(/check constraint/);
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
  });

  test('the same SQL resolves independently in each dataset search_path', async () => {
    expect((await engine.run(sample.id, 'SELECT score FROM points WHERE id = 1')).rows).toEqual([[10]]);
    expect((await engine.run(hidden.id, 'SELECT score FROM points WHERE id = 1')).rows).toEqual([[99]]);
    expect((await engine.run(sample.id, 'SELECT score FROM points WHERE id = 1')).rows).toEqual([[10]]);
  });

  test('repeating prepare is idempotent and different data cannot replace a cached dataset', async () => {
    await engine.prepare(sample, seed);
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
    await expect(engine.prepare(sample, seed + 'INSERT INTO points VALUES (3, 30);')).rejects.toThrow(/cannot be silently replaced/);
  });

  test('read-only tickets reject mutations before execution', async () => {
    await expect(engine.run(sample.id, 'DELETE FROM points')).rejects.toThrow();
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
  });

  test('transaction and role escape attempts cannot commit a learner change', async () => {
    await expect(engine.run(sample.id, 'INSERT INTO points VALUES (3, 30); COMMIT;', { mode: 'schema' })).rejects.toThrow();
    await expect(engine.run(sample.id, 'SET ROLE postgres;', { mode: 'schema' })).rejects.toThrow();
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
  });

  test('queries cannot access another dataset by qualifying its schema', async () => {
    await expect(engine.run(sample.id, 'SELECT * FROM desk_data_runtime_hidden.points')).rejects.toThrow();
  });

  test('bigint and numeric results preserve exact decimal strings', async () => {
    const result = await engine.run(sample.id,
      'SELECT 9007199254740993::bigint AS big, 9007199254740993.000000000000000001::numeric AS precise');
    expect(result.rows).toEqual([['9007199254740993', '9007199254740993.000000000000000001']]);
  });

  test('read result caps apply before returning rows and errors do not poison the next run', async () => {
    await expect(engine.run(sample.id, 'SELECT generate_series(1, 5000) AS n', { rowLimit: 5 })).rejects.toThrow(/5-row limit/);
    expect((await engine.run(sample.id, 'SELECT 1 AS n')).rows).toEqual([[1]]);
  });

  test('every result in a schema batch is capped', async () => {
    await expect(engine.run(sample.id, 'SELECT generate_series(1, 10) AS n; SELECT 1 AS n;', { mode: 'schema', rowLimit: 3 })).rejects.toThrow(/3-row limit/);
    expect((await engine.run(sample.id, 'SELECT 1 AS n')).rows).toEqual([[1]]);
  });

  test('RETURNING output is bounded and its inserted rows roll back', async () => {
    await expect(engine.run(sample.id,
      'INSERT INTO points SELECT n, n FROM generate_series(3, 12) AS n RETURNING id',
      { mode: 'schema', rowLimit: 3 })).rejects.toThrow(/3-row limit/);
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
  });

  test('concurrent callers serialize instead of sharing a transaction', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, id) => engine.run(sample.id, `SELECT ${id} AS id`)));
    expect(results.map((result) => result.rows)).toEqual([[[0]], [[1]], [[2]], [[3]]]);
  });

  test('invalid limits and unknown datasets fail before execution', async () => {
    await expect(engine.run(sample.id, 'SELECT 1', { rowLimit: 0 })).rejects.toThrow(/Row limit/);
    await expect(engine.run(sample.id, 'SELECT 1', { timeoutMs: 0 })).rejects.toThrow(/Statement timeout/);
    await expect(engine.run('missing', 'SELECT 1')).rejects.toThrow(/not loaded/);
  });

  const candidate = `
    CREATE TABLE ticket_values (
      id integer PRIMARY KEY,
      point_id integer NOT NULL REFERENCES points(id),
      code text NOT NULL UNIQUE,
      rating integer NOT NULL CHECK (rating BETWEEN 0 AND 100)
    );
    INSERT INTO ticket_values VALUES (1, 1, 'baseline', 50);
  `;
  const probes = [
    { sql: "INSERT INTO ticket_values VALUES (2, 1, 'valid', 80)", shouldSucceed: true },
    { sql: "INSERT INTO ticket_values VALUES (2, 2, 'valid-again', 100)", shouldSucceed: true },
    { sql: "INSERT INTO ticket_values VALUES (1, 1, 'duplicate-pk', 50)", shouldSucceed: false, expectedErrorCode: '23505' },
    { sql: "INSERT INTO ticket_values VALUES (2, 999, 'orphan', 50)", shouldSucceed: false, expectedErrorCode: '23503' },
    { sql: 'INSERT INTO ticket_values VALUES (2, 1, NULL, 50)', shouldSucceed: false, expectedErrorCode: '23502' },
    { sql: "INSERT INTO ticket_values VALUES (2, 1, 'baseline', 50)", shouldSucceed: false, expectedErrorCode: '23505' },
    { sql: "INSERT INTO ticket_values VALUES (2, 1, 'out-of-range', 101)", shouldSucceed: false, expectedErrorCode: '23514' },
  ];

  test('schema probes grade PK, FK, NOT NULL, UNIQUE, CHECK and isolate successful inserts', async () => {
    const results = await engine.checkSchema(sample.id, candidate, probes);
    expect(results).toHaveLength(7);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(results.slice(2).map((result) => result.errorCode)).toEqual(['23505', '23503', '23502', '23505', '23514']);
    await expect(engine.run(sample.id, 'SELECT * FROM ticket_values')).rejects.toThrow(/does not exist/);
    expect((await engine.run(sample.id, 'SELECT count(*)::integer AS total FROM points')).rows).toEqual([[2]]);
  });

  test('schema probes catch a candidate that omits the CHECK constraint', async () => {
    const wrong = candidate.replace('CHECK (rating BETWEEN 0 AND 100)', '');
    const results = await engine.checkSchema(sample.id, wrong, probes);
    expect(results.slice(0, -1).every((result) => result.passed)).toBe(true);
    expect(results.at(-1)?.passed).toBe(false);
    await expect(engine.run(sample.id, 'SELECT * FROM ticket_values')).rejects.toThrow(/does not exist/);
  });

  test('an unexpected missing table or syntax failure cannot count as a constraint rejection', async () => {
    const results = await engine.checkSchema(sample.id, candidate, [
      { sql: 'INSERT INTO absent_table VALUES (1)', shouldSucceed: false },
    ]);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.errorCode).toBe('42P01');
    await expect(engine.checkSchema(sample.id, candidate, [
      { sql: 'INSERT NOT VALID SQL', shouldSucceed: false },
    ])).rejects.toThrow();
  });

  test('datatype failures require an explicit matching datatype SQLSTATE', async () => {
    const results = await engine.checkSchema(sample.id, 'CREATE TABLE typed_values (id integer);', [
      { sql: "INSERT INTO typed_values VALUES ('not-an-integer')", shouldSucceed: false, expectedErrorCode: '22P02' },
      { sql: "INSERT INTO typed_values VALUES ('not-an-integer')", shouldSucceed: false },
      { sql: "INSERT INTO typed_values VALUES ('not-an-integer')", shouldSucceed: false, expectedErrorCode: '22003' },
    ]);
    expect(results.map((result) => result.passed)).toEqual([true, false, false]);
    await expect(engine.run(sample.id, 'SELECT * FROM typed_values')).rejects.toThrow(/does not exist/);
  });

  test('schema candidate errors throw and roll back previously created objects', async () => {
    await expect(engine.checkSchema(sample.id,
      'CREATE TABLE failed_candidate (id integer PRIMARY KEY); INSERT INTO failed_candidate VALUES (1), (1);',
      [{ sql: 'INSERT INTO failed_candidate VALUES (2)', shouldSucceed: true }],
    )).rejects.toThrow(/unique constraint/);
    await expect(engine.run(sample.id, 'SELECT * FROM failed_candidate')).rejects.toThrow(/does not exist/);
  });

  test('invalid probe kinds and expected syntax/access failures are rejected as probe definitions', async () => {
    await expect(engine.checkSchema(sample.id, candidate, [{ sql: 'SELECT 1', shouldSucceed: true }])).rejects.toThrow(/one INSERT/);
    await expect(engine.checkSchema(sample.id, candidate, [{ sql: 'INSERT INTO points VALUES (3, 3)', shouldSucceed: false, expectedErrorCode: '42601' }])).rejects.toThrow(/integrity or supported datatype/);
    await expect(engine.checkSchema(sample.id, candidate, [{ sql: 'INSERT INTO points VALUES (3, 3)', shouldSucceed: false, expectedErrorCode: '42501' }])).rejects.toThrow(/integrity or supported datatype/);
  });
});
