import { describe, expect, test } from 'vitest';
import { parsedStatements, validateSql } from '../src/grader/structure';

describe('session escapes stay rejected in every ticket', () => {
  test.each([
    ['SET search_path TO public', 'session settings'],
    ['RESET ALL', 'session settings'],
    ['SET ROLE postgres', 'session settings'],
    ['DO $$ BEGIN PERFORM 1; END $$', 'procedural code'],
    ['COPY shipments TO STDOUT', 'files'],
    ['CREATE ROLE intruder', 'Roles'],
    ['GRANT SELECT ON shipments TO PUBLIC', 'Permissions'],
    ['LOCK TABLE shipments', 'LOCK'],
    ['VACUUM shipments', 'VACUUM'],
    ['PREPARE p AS SELECT 1', 'PREPARE'],
    ['LISTEN channel_one', 'LISTEN'],
  ])('%s is refused with a learner-facing reason', async (sql, reason) => {
    await expect(validateSql(sql, { mode: 'write', allow: ['InsertStmt', 'UpdateStmt', 'DeleteStmt', 'CreateStmt', 'DropStmt', 'AlterTableStmt', 'MergeStmt', 'TransactionStmt'], transactions: true })).rejects.toThrow(reason);
  });

  test.each([
    'SELECT * FROM public.shipments',
    'SELECT * FROM pg_catalog.pg_class',
    'SELECT * FROM pg_class',
  ])('schema-qualified or system access is refused: %s', async (sql) => {
    await expect(validateSql(sql, { mode: 'write', allow: ['SelectStmt'] })).rejects.toThrow();
  });
});

describe('per-ticket statement policy', () => {
  test('a statement outside the ticket allow-list is refused with its kind named', async () => {
    await expect(validateSql('DELETE FROM shipments WHERE id = 1', { mode: 'write', allow: ['InsertStmt'] })).rejects.toThrow('delete statements are not allowed in this ticket.');
  });

  test('an allowed statement passes', async () => {
    await expect(validateSql('INSERT INTO shipments (id) VALUES (1)', { mode: 'write', allow: ['InsertStmt'] })).resolves.toBeUndefined();
  });

  test('transaction control is refused unless the ticket sets it', async () => {
    await expect(validateSql('BEGIN', { mode: 'write', allow: ['SelectStmt'] })).rejects.toThrow('Transaction control');
  });

  test('isolation levels, access modes and AND CHAIN are refused in transaction tickets', async () => {
    const options = { mode: 'write' as const, allow: ['TransactionStmt' as const], transactions: true };
    await expect(validateSql('BEGIN ISOLATION LEVEL SERIALIZABLE', options)).rejects.toThrow('Isolation levels');
    await expect(validateSql('BEGIN READ ONLY', options)).rejects.toThrow('Isolation levels');
    await expect(validateSql('COMMIT AND CHAIN', options)).rejects.toThrow('AND CHAIN');
  });

  test('two-phase commit is refused in transaction tickets', async () => {
    await expect(validateSql("PREPARE TRANSACTION 'x'", { mode: 'write', allow: ['TransactionStmt'], transactions: true })).rejects.toThrow('Two-phase commit');
  });

  test('parsed transaction statements carry their kind and savepoint name', async () => {
    const [statement] = await parsedStatements('SAVEPOINT alpha', { mode: 'write', allow: ['TransactionStmt'], transactions: true });
    expect(statement?.kind).toBe('TransactionStmt');
    expect(statement?.transaction).toEqual({ kind: 'TRANS_STMT_SAVEPOINT', savepoint: 'alpha' });
  });

  test('ordinary statements have no transaction information', async () => {
    const [statement] = await parsedStatements('SELECT 1', {});
    expect(statement?.transaction).toBeNull();
  });
});
