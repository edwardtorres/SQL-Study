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
export async function isBareSkeleton(sql: string): Promise<boolean> {
  const tree = await parse(sql) as unknown as { stmts?: { stmt: Node }[] };
  if (!tree.stmts || tree.stmts.length !== 1) return false;
  const select = tree.stmts[0]!.stmt.SelectStmt as Node | undefined;
  if (!select) return false;
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
