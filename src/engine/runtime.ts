import { PGlite } from '@electric-sql/pglite';
import type { DatasetSpec, QueryResult } from '../core/types';
import { parsedStatements } from '../grader';

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
