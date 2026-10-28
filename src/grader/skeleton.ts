import { parse } from 'libpg-query';

type Node = Record<string, unknown>;

// Clauses a bare skeleton may not contain. Presence is checked on the parsed tree, not by matching text.
const FORBIDDEN_CLAUSES = [
  'whereClause', 'groupClause', 'havingClause', 'sortClause', 'limitCount', 'limitOffset',
  'withClause', 'windowClause', 'distinctClause', 'lockingClause', 'larg', 'rarg',
] as const;

// The parser writes these defaults into every SELECT; they say nothing about the query.
const PARSER_DEFAULTS: Record<string, unknown> = { op: 'SETOP_NONE', limitOption: 'LIMIT_OPTION_DEFAULT' };

const present = (value: unknown): boolean => (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null);

/**
 * A bare skeleton is one SELECT that names plain columns (optionally aliased) from one table and
 * nothing else. Write-query starters must be at most this much.
 */
// Write statements (DDL and DML) get the same bar: a table name and no filtering, joins, subqueries or ordering.
// CREATE TABLE may not list columns, because the column definitions are what the learner writes.
const WRITE_SKELETONS = ['CreateStmt', 'InsertStmt', 'UpdateStmt', 'DeleteStmt'] as const;
const FORBIDDEN_IN_WRITE = ['whereClause', 'sortClause', 'groupClause', 'havingClause', 'withClause', 'windowClause', 'limitCount', 'selectStmt', 'SubLink', 'JoinExpr', 'CaseExpr', 'over', 'fromClause'] as const;

function containsForbidden(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbidden);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value as Node).some(([key, child]) => {
    if (FORBIDDEN_IN_WRITE.includes(key as (typeof FORBIDDEN_IN_WRITE)[number]) && present(child)) return true;
    return containsForbidden(child);
  });
}

function isBareWriteSkeleton(statement: Node): boolean {
  const kind = Object.keys(statement)[0];
  if (!WRITE_SKELETONS.includes(kind as (typeof WRITE_SKELETONS)[number])) return false;
  const body = statement[kind!] as Node;
  if (kind === 'CreateStmt' && present(body.tableElts)) return false;
  return !containsForbidden(body);
}

export async function isBareSkeleton(sql: string): Promise<boolean> {
  const tree = await parse(sql) as unknown as { stmts?: { stmt: Node }[] };
  // A DDL starter often creates two bare tables, so every statement is checked, not only the first.
  if (!tree.stmts || tree.stmts.length === 0) return false;
  return tree.stmts.every(({ stmt }) => isBareStatement(stmt));
}

function isBareStatement(statement: Node): boolean {
  // A view's bare skeleton is its query: plain columns from one table, with no filter.
  if (statement.ViewStmt) {
    const query = (statement.ViewStmt as Node).query as Node | undefined;
    return query !== undefined && isBareStatement(query);
  }
  if (!statement.SelectStmt) return isBareWriteSkeleton(statement);
  const select = statement.SelectStmt as Node;
  if (FORBIDDEN_CLAUSES.some((clause) => present(select[clause]))) return false;
  if (select.op !== undefined && select.op !== PARSER_DEFAULTS.op) return false;
  if (select.limitOption !== undefined && select.limitOption !== PARSER_DEFAULTS.limitOption) return false;

  const from = select.fromClause as Node[] | undefined;
  if (!from || from.length !== 1 || !('RangeVar' in from[0]!)) return false;

  const targets = select.targetList as { ResTarget: { val: Node } }[] | undefined;
  if (!targets || targets.length === 0) return false;
  return targets.every(({ ResTarget }) => {
    const column = ResTarget.val.ColumnRef as { fields: Node[] } | undefined;
    return column !== undefined && column.fields.length === 1 && 'String' in column.fields[0]!;
  });
}
