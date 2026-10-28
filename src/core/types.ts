export interface Field { name: string; dataTypeID: number }
export interface QueryResult { fields: Field[]; rows: unknown[][] }
export interface ColumnRule { name: string; type: number }
export type Variant = 'sample' | 'nulls' | 'ties' | 'boundary' | 'empty' | 'nulltext' | 'precision';
export interface DatasetSpec { id: string; label: string; hidden: boolean; seed: number; variant: Variant }
export type Structure = 'window' | 'cte';

// Statement kinds a ticket can allow. Names are libpg-query node names, so the grader reads the parser's own tree.
export const statementKinds = [
  'SelectStmt', 'InsertStmt', 'UpdateStmt', 'DeleteStmt', 'MergeStmt',
  'CreateStmt', 'AlterTableStmt', 'DropStmt', 'TransactionStmt',
  'ViewStmt', 'IndexStmt', 'ExplainStmt',
] as const;
export type StatementKind = typeof statementKinds[number];
// What one ticket allows. Read tickets allow SELECT only. Transaction control is accepted only when a ticket sets it.
export interface Policy { allow: readonly StatementKind[]; transactions?: boolean }
// A plan requirement on a read ticket: the planner's node types for the learner's SELECT must include mustContain and none of mustNotContain. The plan comes from EXPLAIN without ANALYZE, which does not run the query.
export interface PlanCheck { mustContain: readonly string[]; mustNotContain?: readonly string[] }
// A trusted query the grader runs after the learner's statements; its rows describe the resulting state.
export interface CheckQuery { id: string; label: string; sql: string }
// A statement that must succeed (expect 'ok') or fail (expect 'error', with a SQLSTATE class or code).
export interface ConstraintTest { name: string; sql: string; expect: 'ok' | 'error'; sqlstate?: string }

// Mistake tags name the beginner error a wrong variant models. Every wrong variant carries one.
export const mistakeTags = [
  'GE_VS_GT', 'COUNT_STAR_VS_COL', 'MISSING_GROUP_COL', 'LEFT_TO_INNER', 'NULL_EQUALS',
  'NOT_IN_NULL', 'JOIN_FANOUT', 'TIE_NONDETERMINISTIC', 'WHERE_VS_HAVING', 'AND_OR_PRECEDENCE',
  'BETWEEN_END_BOUND', 'INTEGER_DIVISION', 'LIKE_CASE', 'LIKE_WILDCARD', 'DISTINCT_MISUSE', 'CORRELATED_SCOPE',
  'ORDER_DIRECTION', 'NULL_AS_DEFAULT', 'NULL_NO_FALLBACK', 'COALESCE_ORDER', 'AGGREGATE_CHOICE', 'JOIN_KEY',
  'CASE_ORDER', 'STRING_INDEX', 'CONCAT_NULL', 'TIMEZONE_ASSUMED', 'CAST_ROUNDING',
  'UNION_DEDUPES', 'SET_OPERATOR_CHOICE', 'PARTITION_MISSING', 'FRAME_DEFAULT', 'RANK_VS_ROW_NUMBER',
  'LAG_NULL_FIRST', 'MISSING_WHERE_ON_UPDATE', 'CONSTRAINT_MISSING', 'ROLLBACK_MISSING', 'SET_LIMIT_SCOPE',
  'DENSE_VS_RANK', 'FRAME_OFF_BY_ONE', 'COMMIT_MISSING',
] as const;
export type MistakeTag = typeof mistakeTags[number];
export interface WrongVariant { id: string; sql: string; mistake: MistakeTag; explanation: string }

// sample: the Step 1 showcase tickets. guided: fill-in-the-blank. independent: a colleague's ticket.
// boss: one part of a multi-part ticket (bossGroup names the group).
export type Role = 'sample' | 'guided' | 'independent' | 'boss';
// How the starter is written: skeleton (a bare skeleton, write and window tickets), blanks (fill-in blanks, guided), broken (a real broken starter, fix tickets).
export type StarterStyle = 'skeleton' | 'broken' | 'blanks';

export interface Challenge {
  id: string;
  chapterId: number;
  role: Role;
  bossGroup?: string;
  title: string;
  // write: a bare skeleton at most. fix: a real broken starter. guided: fill-in blanks.
  starterStyle: StarterStyle;
  colleague: string;
  colleagueRole: string;
  summary: string;
  instructions: string;
  lesson?: string;
  exampleSql?: string;
  guidedSql?: string;
  starterSql: string;
  referenceSql: string;
  wrongVariants: readonly WrongVariant[];
  ordered: boolean;
  columns: readonly ColumnRule[];
  structure?: Structure;
  // Write tickets declare a policy and check queries; the grader runs learner statements, then the checks.
  policy?: Policy;
  checks?: readonly CheckQuery[];
  constraintTests?: readonly ConstraintTest[];
  // runs 2: the statements run twice in one rolled-back transaction, and the state after each run must match the reference (idempotency).
  runs?: 1 | 2;
  // plan: a read ticket's learner SELECT must produce the planner nodes named here, on every dataset.
  plan?: PlanCheck;
  // Chapter 13 items: the solve time the item is written for, in minutes.
  estimatedMinutes?: number;
  hints: readonly [string, string, string];
  docs: readonly { label: string; url: string }[];
  datasets: readonly DatasetSpec[];
}
export interface ResultDiff { passed: boolean; message: string; missing: unknown[][]; extra: unknown[][] }
export interface DatasetOutcome { id: string; label: string; hidden: boolean; passed: boolean; diff: ResultDiff }
export interface MistakeFeedback { id: string; mistake: MistakeTag; explanation: string }
export interface GradeReport { passed: boolean; outcomes: DatasetOutcome[]; elapsedMs: number; error?: string; mistake?: MistakeFeedback }
