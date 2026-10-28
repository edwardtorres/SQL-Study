import { PGlite } from '@electric-sql/pglite';
import type { DatasetSpec, QueryResult } from '../core/types';
import { nodeTypes } from '../grader/plan';
import { parsedStatements } from '../grader';
import type { ParsedStatement } from '../grader/structure';
import type { CheckQuery, ConstraintTest, StatementKind } from '../core/types';
import { LearnerTransaction, LearnerTransactionError } from './learner-transaction';

export interface RunOptions {
  mode?: 'read' | 'schema';
  timeoutMs?: number;
  rowLimit?: number;
}

export interface SchemaProbe {
  sql: string;
  shouldSucceed: boolean;
  expectedErrorCode?: string;
}

export interface SchemaProbeResult {
  passed: boolean;
  errorCode?: string;
  message: string;
}

type ValidatedStatements = Awaited<ReturnType<typeof parsedStatements>>;
const DATATYPE_ERROR_CODES = new Set(['22P02', '22001', '22003', '22007', '22008', '42804']);

interface PreparedDataset {
  schema: string;
  role: string;
  signature: string;
}

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

// Statement timeouts and worker crashes must reach the worker so it can restart. Ordinary SQL errors become learner feedback.
const isFatal = (error: unknown): boolean => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code === '57014' || code === '53200' || error instanceof WebAssembly.RuntimeError;
};
const learnerMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);
const sqlstateOf = (error: unknown): string | null => (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null);

// Learner transaction control becomes savepoint calls inside the grader's transaction; see learner-transaction.ts.
function translateTransaction(tx: LearnerTransaction, transaction: { kind: string; savepoint?: string }): string[] {
  const name = transaction.savepoint ?? '';
  switch (transaction.kind) {
    case 'TRANS_STMT_BEGIN': case 'TRANS_STMT_START': return tx.begin();
    case 'TRANS_STMT_COMMIT': return tx.commit();
    case 'TRANS_STMT_ROLLBACK': return tx.rollback();
    case 'TRANS_STMT_SAVEPOINT': return tx.savepoint(name);
    case 'TRANS_STMT_RELEASE': return tx.release(name);
    case 'TRANS_STMT_ROLLBACK_TO': return tx.rollbackTo(name);
    default: throw new LearnerTransactionError('0A000', 'That transaction command is not available in tickets.');
  }
}

export interface StateOptions {
  allow: readonly StatementKind[];
  transactions?: boolean;
  runs?: 1 | 2;
  checks: readonly CheckQuery[];
  tests: readonly ConstraintTest[];
  timeoutMs?: number;
  rowLimit?: number;
}
export interface CheckOutcome { id: string; label: string; result: QueryResult | null; error: string | null }
export interface TestOutcome { name: string; passed: boolean; message: string }
// rerunChecks is present when the ticket runs its statements twice: the checks after the second run.
export interface StateResult { learnerError: string | null; checks: CheckOutcome[]; tests: TestOutcome[]; rerunChecks?: CheckOutcome[] }

/**
 * One instance belongs to one worker. Datasets are retained; learner effects
 * never are. All operations serialize on the same connection so one request's
 * rollback cannot interfere with another request's transaction.
 */
export class WarmEngine {
  private readonly prepared = new Map<string, PreparedDataset>();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(private readonly db: PGlite) {}

  static async create(options: { initialMemory?: number } = {}): Promise<WarmEngine> {
    const db = await PGlite.create({
      ...options,
      // These small practice datasets do not need PostgreSQL's 128 MB shared
      // buffer default. Preserve required single-user flags when overriding
      // startParams: PGlite replaces, rather than appends, this array.
      startParams: [...PGlite.defaultStartParams,
        '-c', 'shared_buffers=16MB', '-c', 'work_mem=4MB', '-c', 'maintenance_work_mem=16MB'],
      // Default number parsers can round bigint and numeric values. Preserve
      // the PostgreSQL text representation for exact grading.
      parsers: { 20: (value: string) => value, 1700: (value: string) => value },
    });
    try {
      await db.exec('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      const database = await db.query<{ name: string }>('SELECT current_database() AS name');
      const name = database.rows[0]?.name;
      if (!name) throw new Error('Could not identify the practice database.');
      await db.exec(`REVOKE CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(name)} FROM PUBLIC`);
      return new WarmEngine(db);
    } catch (error) {
      await db.close();
      throw error;
    }
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work, work);
    this.queue = task.catch(() => undefined);
    return task;
  }

  async prepare(dataset: DatasetSpec, sql: string): Promise<void> {
    return this.serial(async () => {
      if (this.closed) throw new Error('The practice engine is closed.');
      if (!/^[a-z][a-z0-9_]{0,24}$/.test(dataset.id)) {
        throw new Error('Dataset IDs must be short lowercase SQL-safe identifiers.');
      }
      const signature = JSON.stringify([dataset.seed, dataset.variant, sql]);
      const existing = this.prepared.get(dataset.id);
      if (existing) {
        if (existing.signature !== signature) throw new Error('A loaded dataset cannot be silently replaced.');
        return;
      }
      const schema = `desk_data_${dataset.id}`;
      const role = `desk_learner_${dataset.id}`;
      await this.db.exec('BEGIN');
      try {
        await this.db.exec(`CREATE ROLE ${quoteIdentifier(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
        await this.db.exec(`CREATE SCHEMA ${quoteIdentifier(schema)} AUTHORIZATION ${quoteIdentifier(role)}`);
        await this.db.exec(`SET LOCAL ROLE ${quoteIdentifier(role)}`);
        await this.db.exec(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`);
        await this.db.exec(sql);
        await this.db.exec('COMMIT');
        this.prepared.set(dataset.id, { schema, role, signature });
      } catch (error) {
        await this.db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  async run(datasetId: string, sql: string, options: RunOptions = {}): Promise<QueryResult> {
    return this.serial(async () => {
      if (this.closed) throw new Error('The practice engine is closed.');
      const dataset = this.prepared.get(datasetId);
      if (!dataset) throw new Error('The requested dataset is not loaded.');
      const mode = options.mode ?? 'read';
      const rowLimit = options.rowLimit ?? 1000;
      const timeoutMs = options.timeoutMs ?? 1500;
      if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 10_000) {
        throw new Error('Row limit must be an integer from 1 to 10000.');
      }
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
        throw new Error('Statement timeout must be an integer from 1 to 10000 milliseconds.');
      }
      const statements = await parsedStatements(sql, { mode });
      return this.withDatasetTransaction(dataset, timeoutMs, () => this.executeStatements(statements, rowLimit));
    });
  }

  /** Probe a learner-created schema without retaining DDL or successful inserts. */
  async checkSchema(
    datasetId: string,
    candidateSql: string,
    probes: readonly SchemaProbe[],
    options: { timeoutMs?: number } = {},
  ): Promise<SchemaProbeResult[]> {
    return this.serial(async () => {
      if (this.closed) throw new Error('The practice engine is closed.');
      const dataset = this.prepared.get(datasetId);
      if (!dataset) throw new Error('The requested dataset is not loaded.');
      const timeoutMs = options.timeoutMs ?? 1500;
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
        throw new Error('Statement timeout must be an integer from 1 to 10000 milliseconds.');
      }
      if (probes.length < 1 || probes.length > 30) throw new Error('Schema grading needs 1 to 30 probes.');
      const candidate = await parsedStatements(candidateSql, { mode: 'schema' });
      const validated: { probe: SchemaProbe; statements: ValidatedStatements }[] = [];
      for (const probe of probes) {
        if (probe.expectedErrorCode && (!/^[0-9A-Z]{5}$/.test(probe.expectedErrorCode) || (!probe.expectedErrorCode.startsWith('23') && !DATATYPE_ERROR_CODES.has(probe.expectedErrorCode)))) {
          throw new Error('An expected probe failure must identify an integrity or supported datatype error.');
        }
        const statements = await parsedStatements(probe.sql, { mode: 'schema' });
        if (statements.length !== 1 || !['InsertStmt', 'UpdateStmt', 'DeleteStmt'].includes(statements[0]?.kind ?? '')) {
          throw new Error('A schema probe must be one INSERT, UPDATE, or DELETE statement.');
        }
        validated.push({ probe, statements });
      }
      return this.withDatasetTransaction(dataset, timeoutMs, async () => {
        await this.executeStatements(candidate, 1000);
        const outcomes: SchemaProbeResult[] = [];
        for (const { probe, statements } of validated) {
          await this.db.exec('SAVEPOINT desk_probe');
          try {
            await this.executeStatements(statements, 1000);
            outcomes.push({
              passed: probe.shouldSucceed,
              message: probe.shouldSucceed ? 'The valid insert or change succeeded.' : 'An invalid insert or change unexpectedly succeeded.',
            });
          } catch (error) {
            const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
            if (code === '57014' || code === '53200' || error instanceof WebAssembly.RuntimeError) throw error;
            const isConstraint = code?.startsWith('23') ?? false;
            const isExplicitDatatype = code !== undefined && DATATYPE_ERROR_CODES.has(code) && probe.expectedErrorCode === code;
            const codeMatches = probe.expectedErrorCode === undefined || probe.expectedErrorCode === code;
            const passed = !probe.shouldSucceed && codeMatches && (isConstraint || isExplicitDatatype);
            outcomes.push({
              passed,
              ...(code === undefined ? {} : { errorCode: code }),
              message: passed ? 'The invalid insert or change was rejected by the required constraint or datatype.'
                : `Probe failed for an unexpected reason${code === undefined ? '' : ` (SQLSTATE ${code})`}.`,
            });
          } finally {
            // Recover an aborted subtransaction before testing the next probe;
            // successful probe writes are discarded too.
            await this.db.exec('ROLLBACK TO SAVEPOINT desk_probe');
            await this.db.exec('RELEASE SAVEPOINT desk_probe');
          }
        }
        return outcomes;
      });
    });
  }

  /**
   * Runs the learner's statements, then trusted check queries and constraint tests, inside one rolled-back
   * transaction. Callers compare the result with the reference's result on the same dataset.
   */
  async runState(datasetId: string, sql: string, options: StateOptions): Promise<StateResult> {
    return this.serial(async () => {
      if (this.closed) throw new Error('The practice engine is closed.');
      const dataset = this.prepared.get(datasetId);
      if (!dataset) throw new Error('The requested dataset is not loaded.');
      const timeoutMs = options.timeoutMs ?? 1500;
      const rowLimit = options.rowLimit ?? 1000;
      if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 10_000) throw new Error('Row limit must be an integer from 1 to 10000.');
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new Error('Statement timeout must be an integer from 1 to 10000 milliseconds.');
      if (options.runs === 2 && options.transactions) throw new Error('A ticket that runs its statements twice cannot also set transactions.');
      const statements = await parsedStatements(sql, { mode: 'write', allow: options.allow, transactions: options.transactions ?? false });
      return this.withDatasetTransaction(dataset, timeoutMs, async (): Promise<StateResult> => {
        const tx = new LearnerTransaction();
        try {
          await this.executeLearner(statements, rowLimit, tx);
          tx.requireNotAborted();
        } catch (error) {
          if (isFatal(error)) throw error;
          return { learnerError: learnerMessage(error), checks: [], tests: [] };
        }
        const checks: CheckOutcome[] = [];
        for (const check of options.checks) checks.push(await this.checkOutcome(check, rowLimit));
        let rerunChecks: CheckOutcome[] | undefined;
        if (options.runs === 2) {
          // An idempotent load leaves the same state when its statements run again on top of their own result.
          try { await this.executeLearner(statements, rowLimit, new LearnerTransaction()); }
          catch (error) {
            if (isFatal(error)) throw error;
            return { learnerError: `Running the statements a second time failed: ${learnerMessage(error)}`, checks: [], tests: [] };
          }
          rerunChecks = [];
          for (const check of options.checks) rerunChecks.push(await this.checkOutcome(check, rowLimit));
        }
        const tests: TestOutcome[] = [];
        for (const test of options.tests) tests.push(await this.constraintOutcome(test));
        return rerunChecks ? { learnerError: null, checks, tests, rerunChecks } : { learnerError: null, checks, tests };
      });
    });
  }

  // The planner's node types for one read statement, from EXPLAIN without ANALYZE. The planner chooses a plan without running the query.
  async planNodes(datasetId: string, sql: string, timeoutMs = 1500): Promise<string[]> {
    return this.serial(async () => {
      if (this.closed) throw new Error('The practice engine is closed.');
      const dataset = this.prepared.get(datasetId);
      if (!dataset) throw new Error('The requested dataset is not loaded.');
      const statements = await parsedStatements(sql, { mode: 'read' });
      const statement = statements[0];
      if (statements.length !== 1 || !statement) throw new Error('A plan is taken from one SELECT statement.');
      return this.withDatasetTransaction(dataset, timeoutMs, async () => {
        const result = await this.db.query<Record<string, unknown>>(`EXPLAIN (FORMAT JSON) ${statement.sql.replace(/;\s*$/, '')}`);
        const cell = Object.values(result.rows[0] ?? {})[0];
        const plan: unknown = typeof cell === 'string' ? JSON.parse(cell) : cell;
        return nodeTypes(plan);
      });
    });
  }

  private async executeLearner(statements: readonly ParsedStatement[], rowLimit: number, tx: LearnerTransaction): Promise<void> {
    for (const statement of statements) {
      if (statement.transaction) {
        for (const sql of translateTransaction(tx, statement.transaction)) await this.db.exec(sql);
        continue;
      }
      tx.requireNotAborted();
      try {
        await this.executeStatements([statement], rowLimit);
      } catch (error) {
        if (isFatal(error)) throw error;
        // Recover the grader's transaction; an open learner block stays aborted until the learner ends it.
        for (const sql of tx.fail()) await this.db.exec(sql);
        throw error;
      }
    }
  }

  private async checkOutcome(check: CheckQuery, rowLimit: number): Promise<CheckOutcome> {
    await this.db.exec('SAVEPOINT desk_check');
    try {
      const result = await this.boundedRows(check.sql.replace(/;\s*$/, ''), rowLimit);
      return { id: check.id, label: check.label, result, error: null };
    } catch (error) {
      if (isFatal(error)) throw error;
      return { id: check.id, label: check.label, result: null, error: learnerMessage(error) };
    } finally {
      await this.db.exec('ROLLBACK TO SAVEPOINT desk_check');
      await this.db.exec('RELEASE SAVEPOINT desk_check');
    }
  }

  private async boundedRows(sql: string, rowLimit: number): Promise<QueryResult> {
    await this.db.exec(`DECLARE desk_check NO SCROLL CURSOR FOR ${sql}`);
    const result = await this.db.query<unknown[]>(`FETCH FORWARD ${rowLimit + 1} FROM desk_check`, [], { rowMode: 'array' });
    if (result.rows.length > rowLimit) throw new Error(`Result exceeds the ${rowLimit}-row limit. Add a filter or LIMIT.`);
    await this.db.exec('CLOSE desk_check');
    return { rows: result.rows, fields: result.fields };
  }

  // A constraint test runs its statement in a savepoint and always rolls it back, so tests never change later tests.
  private async constraintOutcome(test: ConstraintTest): Promise<TestOutcome> {
    await this.db.exec('SAVEPOINT desk_constraint');
    let failed = false;
    let code: string | null = null;
    let message = '';
    try {
      await this.db.exec(test.sql);
    } catch (error) {
      if (isFatal(error)) throw error;
      failed = true;
      code = sqlstateOf(error);
      message = learnerMessage(error);
    } finally {
      await this.db.exec('ROLLBACK TO SAVEPOINT desk_constraint');
      await this.db.exec('RELEASE SAVEPOINT desk_constraint');
    }
    if (test.expect === 'ok') {
      return { name: test.name, passed: !failed, message: failed ? `was rejected: ${message}` : 'was accepted.' };
    }
    const matches = failed && (test.sqlstate === undefined || (code !== null && (test.sqlstate.length === 2 ? code.startsWith(test.sqlstate) : code === test.sqlstate)));
    if (matches) return { name: test.name, passed: true, message: `was rejected with SQLSTATE ${code}.` };
    return { name: test.name, passed: false, message: failed ? `was rejected with SQLSTATE ${code ?? 'none'}, not ${test.sqlstate ?? 'an error'}: ${message}` : `should have been rejected${test.sqlstate ? ` with SQLSTATE ${test.sqlstate}` : ''}, but the statement succeeded.` };
  }

  private async withDatasetTransaction<T>(dataset: PreparedDataset, timeoutMs: number, work: () => Promise<T>): Promise<T> {
    await this.db.exec('BEGIN');
    try {
      await this.db.exec(`SET LOCAL ROLE ${quoteIdentifier(dataset.role)}`);
      await this.db.exec(`SET LOCAL search_path TO ${quoteIdentifier(dataset.schema)}`);
      await this.db.exec(`SET LOCAL statement_timeout TO '${timeoutMs}ms'`);
      return await work();
    } finally {
      // ROLLBACK resets DDL, DML, role, search_path and timeout, including
      // when a statement put the transaction in an aborted state.
      await this.db.exec('ROLLBACK');
    }
  }

  private async executeStatements(statements: ValidatedStatements, rowLimit: number): Promise<QueryResult> {
    let last: QueryResult = { rows: [], fields: [] };
    for (const statement of statements) {
      if (statement.kind === 'SelectStmt') {
        // Cursor FETCH caps rows before they are materialized in JavaScript.
        await this.db.exec(`DECLARE desk_result NO SCROLL CURSOR FOR ${statement.sql}`);
        const result = await this.db.query<unknown[]>(
          `FETCH FORWARD ${rowLimit + 1} FROM desk_result`, [], { rowMode: 'array' },
        );
        if (result.rows.length > rowLimit) throw new Error(`Result exceeds the ${rowLimit}-row limit. Add a filter or LIMIT.`);
        await this.db.exec('CLOSE desk_result');
        last = { rows: result.rows, fields: result.fields };
      } else if (statement.returning) {
        // PostgreSQL cannot DECLARE a cursor over modifying CTEs. A bounded
        // projection prevents an unbounded RETURNING result entering JS.
        const result = await this.db.query<unknown[]>(
          `WITH desk_changes AS (\n${statement.sql}\n) SELECT * FROM desk_changes LIMIT ${rowLimit + 1}`,
          [], { rowMode: 'array' },
        );
        if (result.rows.length > rowLimit) throw new Error(`Result exceeds the ${rowLimit}-row limit. Add a filter or LIMIT.`);
        last = { rows: result.rows, fields: result.fields };
      } else {
        const results = await this.db.exec(statement.sql, { rowMode: 'array' });
        for (const result of results) {
          if (result.rows.length > rowLimit) throw new Error(`Result exceeds the ${rowLimit}-row limit. Add a filter or LIMIT.`);
        }
        const result = results.at(-1);
        last = { rows: (result?.rows ?? []) as unknown[][], fields: result?.fields ?? [] };
      }
    }
    return last;
  }

  memoryBytes(): number {
    return this.db.Module.wasmMemory.buffer.byteLength;
  }

  async close(): Promise<void> {
    return this.serial(async () => {
      if (this.closed) return;
      this.closed = true;
      await this.db.close();
    });
  }
}
