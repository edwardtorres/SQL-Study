import { describe, expect, test } from 'vitest';
import { MAX_SQL_LENGTH, parsedStatements, validateSql } from '../src/grader/structure';

describe('PostgreSQL AST validation', () => {
  test.each([
    'SELECT id FROM shipments WHERE weight_kg >= 100 ORDER BY id',
    'WITH x AS (SELECT id FROM shipments) SELECT * FROM x',
    'SELECT ROW_NUMBER() OVER (PARTITION BY shipment_id ORDER BY occurred_at DESC, id DESC) FROM shipment_events',
    'SELECT count(*), coalesce(sum(amount), 0) FROM invoices',
    "SELECT EXTRACT(YEAR FROM CURRENT_DATE), 'x'::text",
    'SELECT pg_catalog.lower(name) FROM customers',
    'SELECT * FROM generate_series(1, 100)',
    'SELECT pg_sleep(0.001)',
  ])('accepts ordinary analytical SQL: %s', async (sql) => {
    await expect(validateSql(sql)).resolves.toBeUndefined();
  });
  test('requires actual window AST nodes rather than matching strings/comments', async () => {
    await expect(validateSql('SELECT ROW_NUMBER() OVER (ORDER BY id) FROM shipments', { structure: 'window' })).resolves.toBeUndefined();
    await expect(validateSql("SELECT 'ROW_NUMBER() OVER (ORDER BY id)' /* window */", { structure: 'window' })).rejects.toThrow('requires a window');
    await expect(validateSql('SELECT row_number FROM shipments', { structure: 'window' })).rejects.toThrow('requires a window');
  });
  test('requires real CTE AST nodes rather than WITH text', async () => {
    await expect(validateSql('WITH x AS (SELECT 1) SELECT * FROM x', { structure: 'cte' })).resolves.toBeUndefined();
    await expect(validateSql("SELECT 'WITH x AS (SELECT 1)'", { structure: 'cte' })).rejects.toThrow('common table expression');
  });
  test.each([
    'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT x', 'SET ROLE other', 'RESET ALL',
    "SET statement_timeout = '0'", 'CREATE ROLE x', 'CREATE SCHEMA x', 'DROP SCHEMA public',
    'COPY shipments TO STDOUT', 'DO $$ BEGIN NULL; END $$', 'GRANT SELECT ON shipments TO PUBLIC',
    'ALTER TABLE shipments ADD COLUMN x int', 'TRUNCATE shipments', 'CREATE EXTENSION pgcrypto',
    'PREPARE x AS SELECT 1', 'EXECUTE x', 'VACUUM', 'LISTEN x', 'NOTIFY x',
    'SELECT 1; COMMIT', 'SELECT 1 INTO stolen',
    "SELECT set_config('statement_timeout', '0', true)",
    "SELECT pg_catalog.set_config('role', 'other', true)",
    "SELECT pg_read_file('/etc/passwd')", "SELECT nextval('invoice_seq')", "SELECT setval('invoice_seq',1)",
    "SELECT pg_advisory_lock(1)",
    'SELECT * FROM other_dataset.shipments', 'SELECT * FROM pg_catalog.pg_roles',
    'SELECT * FROM pg_roles', 'SELECT other_dataset.shipments.id FROM shipments',
    'WITH x AS (DELETE FROM shipments RETURNING *) SELECT * FROM x',
  ])('rejects unsafe or session-changing SQL: %s', async (sql) => {
    await expect(validateSql(sql, { mode: 'schema' })).rejects.toThrow();
  });
  test.each([
    'INSERT INTO shipments(id) VALUES (1)',
    'UPDATE shipments SET id = 2',
    'DELETE FROM shipments',
    'CREATE TABLE x(id int)',
    'DROP TABLE shipments',
    'WITH x AS (DELETE FROM shipments RETURNING *) SELECT * FROM x',
  ])('read tickets reject writes, including nested CTEs: %s', async (sql) => {
    await expect(validateSql(sql)).rejects.toThrow();
  });
  test('schema mode permits transactionally isolated table exercises', async () => {
    await expect(validateSql('CREATE TABLE draft (id integer PRIMARY KEY, amount numeric(12,2) CHECK(amount >= 0)); INSERT INTO draft VALUES (1, 2.50); UPDATE draft SET amount = 3 WHERE id = 1; SELECT * FROM draft; DELETE FROM draft; DROP TABLE draft', { mode: 'schema' })).resolves.toBeUndefined();
  });
  test.each([
    'CREATE TEMP TABLE x(id int)', 'CREATE UNLOGGED TABLE x(id int)',
    'CREATE TABLE other.x(id int)', 'DROP TABLE other.x', 'DROP TABLE shipments CASCADE',
    'CREATE TABLE x(id int) TABLESPACE pg_global',
    'CREATE TABLE x(id int) INHERITS(shipments)',
    'CREATE TABLE x AS SELECT * FROM shipments',
    "SELECT 'shipments'::regclass",
    'CREATE TABLE x(id custom_domain)',
    'CREATE TABLE x(id int GENERATED ALWAYS AS IDENTITY (START WITH 100))',
  ])('schema mode rejects schema escapes and global storage features: %s', async (sql) => {
    await expect(validateSql(sql, { mode: 'schema' })).rejects.toThrow();
  });
  test('rejects invalid, empty, oversized and NUL-containing SQL', async () => {
    for (const sql of ['', '   ', '-- comment only', 'SELECT FROM', 'SELECT 1\0; COMMIT', `SELECT '${'x'.repeat(MAX_SQL_LENGTH)}'`]) {
      await expect(validateSql(sql)).rejects.toThrow();
    }
  });
  test('descriptors identify RETURNING without matching SQL string literals', async () => {
    const statements = await parsedStatements("INSERT INTO x VALUES (1) RETURNING id; UPDATE x SET id=2 RETURNING id; DELETE FROM x RETURNING id; SELECT 'RETURNING id'", { mode: 'schema' });
    expect(statements.map((statement) => statement.returning)).toEqual([true, true, true, false]);
  });
  test('uses parser UTF-8 locations for batches with comments and semicolons inside strings', async () => {
    const sql = "/* café */ CREATE TABLE draft(label text); INSERT INTO draft VALUES ('é;✔'); SELECT * FROM draft; DROP TABLE draft;";
    const statements = await parsedStatements(sql, { mode: 'schema' });
    expect(statements.map((statement) => statement.kind)).toEqual(['CreateStmt', 'InsertStmt', 'SelectStmt', 'DropStmt']);
    expect(statements[1]?.sql).toContain("'é;✔'");
    expect(statements[2]?.sql.trim()).toBe('SELECT * FROM draft');
    for (const statement of statements) await expect(validateSql(statement.sql, { mode: 'schema' })).resolves.toBeUndefined();
  });
});
