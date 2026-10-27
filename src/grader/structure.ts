import { parse } from 'libpg-query';
import type { Structure } from '../core/types';

export const MAX_SQL_LENGTH = 20_000;
export interface SqlOptions { mode?: 'read' | 'schema'; structure?: Structure }
interface Ast { [key: string]: unknown }
const SAFE_STATEMENTS = new Set(['SelectStmt', 'CreateStmt', 'InsertStmt', 'UpdateStmt', 'DeleteStmt', 'DropStmt']);
const SAFE_FUNCTIONS = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'greatest', 'least',
  'lower', 'upper', 'length', 'char_length', 'character_length', 'octet_length', 'substring', 'substr',
  'trim', 'btrim', 'ltrim', 'rtrim', 'concat', 'concat_ws', 'left', 'right', 'replace', 'split_part', 'position', 'strpos',
  'regexp_replace', 'regexp_match', 'regexp_matches', 'round', 'ceil', 'ceiling', 'floor', 'abs', 'mod', 'power', 'sqrt', 'sign', 'trunc',
  'row_number', 'rank', 'dense_rank', 'lag', 'lead', 'first_value', 'last_value', 'nth_value', 'ntile', 'percent_rank', 'cume_dist',
  'date_trunc', 'date_part', 'date_bin', 'extract', 'now', 'age', 'make_date', 'make_timestamp', 'make_timestamptz',
  'to_char', 'to_date', 'to_timestamp', 'timezone', 'generate_series', 'unnest', 'array_agg', 'string_agg',
  'bool_and', 'bool_or', 'every', 'array_length', 'cardinality', 'json_agg', 'jsonb_agg', 'json_build_object',
  'pg_sleep', // Deliberate slow-query exercises are still bounded by worker and statement deadlines.
]);
const SAFE_TYPES = new Set([
  'int2', 'int4', 'int8', 'smallint', 'integer', 'bigint', 'float4', 'float8', 'real', 'double precision',
  'numeric', 'decimal', 'bool', 'boolean', 'text', 'varchar', 'bpchar', 'char', 'character', 'character varying',
  'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval', 'json', 'jsonb', 'bytea', 'uuid', 'serial', 'bigserial', 'smallserial',
]);
function record(value: unknown): value is Ast { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: unknown) => record(item) && record(item.String) && typeof item.String.sval === 'string' ? item.String.sval : '');
}
function reject(message: string): never { throw new Error(message); }
function checkRelation(node: Ast): void {
  if (node.schemaname || node.catalogname) reject('Use unqualified tables from the current dataset; cross-schema access is not allowed.');
  if (node.relpersistence && node.relpersistence !== 'p') reject('Temporary and unlogged tables are not allowed.');
  if (typeof node.relname === 'string' && /^(?:pg_|sql_)/i.test(node.relname)) reject('System tables are not available in tickets.');
}
async function validatedTree(sql: string, options: SqlOptions): Promise<Ast> {
  if (!sql.trim()) reject('Write a SQL query before running.');
  if (sql.length > MAX_SQL_LENGTH) reject(`SQL must be at most ${MAX_SQL_LENGTH} characters.`);
  if (sql.includes('\0')) reject('SQL cannot contain a NUL character.');
  const tree = await parse(sql) as unknown as Ast;
  if (!Array.isArray(tree.stmts) || tree.stmts.length === 0) reject('Write a SQL statement before running.');
  if ((options.mode ?? 'read') === 'read' && tree.stmts.length !== 1) reject('Query tickets accept one SELECT statement.');
  let windowFound = false;
  let cteFound = false;
  let visited = 0;
  const visit = (value: unknown): void => {
    if (++visited > 50_000) reject('SQL structure is too complex for this ticket.');
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!record(value)) return;
    if (typeof value.relname === 'string') checkRelation(value);
    for (const [key, child] of Object.entries(value)) {
      if (/^[A-Z].*Stmt$/.test(key)) {
        if (!SAFE_STATEMENTS.has(key)) reject(`${key.replace(/Stmt$/, '')} statements are not allowed in tickets.`);
        if ((options.mode ?? 'read') === 'read' && key !== 'SelectStmt') reject('Read-only tickets cannot change data, including inside CTEs.');
      }
      if (key === 'SelectStmt' && record(child) && child.intoClause) reject('SELECT INTO is not allowed; use a schema ticket for DDL.');
      if (key === 'CreateStmt' && record(child) && (child.tablespacename || child.tableSpaceName || child.accessMethod || child.options || child.inhRelations || child.partbound || child.partspec)) reject('Storage, inheritance, and partition options are not available in schema tickets.');
      if (key === 'DropStmt' && record(child)) {
        if (child.removeType !== 'OBJECT_TABLE') reject('Only DROP TABLE is allowed in schema tickets.');
        if (child.behavior === 'DROP_CASCADE') reject('DROP CASCADE is not allowed; drop only the named ticket table.');
        if (!Array.isArray(child.objects)) reject('A DROP TABLE target is required.');
        for (const object of child.objects) {
          const parts = record(object) && record(object.List) ? names(object.List.items) : [];
          if (parts.length !== 1 || !parts[0] || /^(?:pg_|sql_)/i.test(parts[0])) reject('DROP TABLE must name an unqualified dataset table.');
        }
      }
      if (key === 'FuncCall' && record(child)) {
        const parts = names(child.funcname);
        const name = parts.at(-1)?.toLowerCase();
        if (parts.length > 2 || (parts.length === 2 && parts[0] !== 'pg_catalog') || !name || !SAFE_FUNCTIONS.has(name)) reject('That function is not available in the SQL practice worker.');
        if (child.over) windowFound = true;
      }
      if ((key === 'TypeName' || key === 'typeName' || key === 'ofTypename') && record(child)) {
        const parts = names(child.names);
        if (parts.length > 2 || (parts.length === 2 && parts[0] !== 'pg_catalog') || !SAFE_TYPES.has(parts.at(-1)?.toLowerCase() ?? '')) reject('Use a supported built-in PostgreSQL data type.');
      }
      if (key === 'A_Expr' && record(child) && names(child.name).length > 1) reject('Schema-qualified operators are not allowed.');
      if (key === 'ColumnRef' && record(child) && Array.isArray(child.fields) && child.fields.length > 2) reject('Use only dataset table aliases and column names.');
      if (key === 'CollateClause' && record(child) && names(child.collname).length > 1) reject('Schema-qualified collations are not allowed.');
      if (key === 'DefElem') reject('Storage and sequence configuration options are not available in tickets.');
      if (key === 'CommonTableExpr') {
        cteFound = true;
        if (record(child) && record(child.ctequery) && !('SelectStmt' in child.ctequery)) reject('Data-changing CTEs are not allowed; use separate statements in a schema ticket.');
      }
      visit(child);
    }
  };
  visit(tree);
  if (options.structure === 'window' && !windowFound) reject('This ticket requires a window function with OVER.');
  if (options.structure === 'cte' && !cteFound) reject('This ticket requires a WITH common table expression.');
  return tree;
}
export async function validateSql(sql: string, options: SqlOptions = {}): Promise<void> { await validatedTree(sql, options); }

/** Validated SQL slices use the parser's UTF-8 byte offsets, never semicolon splitting. */
export async function parsedStatements(sql: string, options: SqlOptions = {}): Promise<{ sql: string; kind: string; returning: boolean }[]> {
  const tree = await validatedTree(sql, options);
  const bytes = new TextEncoder().encode(sql);
  return (tree.stmts as unknown[]).map((raw) => {
    if (!record(raw) || !record(raw.stmt)) reject('Invalid parsed statement.');
    const start = typeof raw.stmt_location === 'number' ? raw.stmt_location : 0;
    const length = typeof raw.stmt_len === 'number' && raw.stmt_len > 0 ? raw.stmt_len : bytes.length - start;
    const kind = Object.keys(raw.stmt)[0] ?? '';
    const statement = raw.stmt[kind];
    const returning = record(statement) && Boolean(statement.returningClause || statement.returningList);
    return { sql: new TextDecoder().decode(bytes.slice(start, start + length)), kind, returning };
  });
}
