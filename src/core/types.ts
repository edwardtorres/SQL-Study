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
  // Chapter 10: dimensions, keys and the fact table.
  'DIMENSION_DUPLICATE', 'DIRECTION_SWAPPED', 'IDENTITY_MISSING', 'IDENTITY_BY_DEFAULT', 'NATURAL_KEY_AS_SURROGATE',
  'CONSTRAINT_TOO_STRICT', 'FACT_MISSING_KEY', 'FACT_GRAIN', 'LIMIT_TRUNCATES',
  // Chapter 11: upserts, MERGE, watermarks, SCD2, data-quality reads and views.
  'UPSERT_DUPLICATE_ON_RERUN', 'UPSERT_ADDS_ON_RERUN', 'LATEST_VS_EARLIEST', 'MERGE_NOT_MATCHED', 'MERGE_MATCHED_IGNORED',
  'MERGE_NO_DELETE', 'WATERMARK_BOUNDARY', 'WATERMARK_NOT_ADVANCED', 'DUPLICATE_KEY_IN_BATCH', 'NULL_LOADED',
  'SCD2_MULTIPLE_CURRENT', 'SCD2_OVERWRITE', 'SCD2_NOOP_VERSION', 'DUPLICATE_DETECTION',
  'VIEW_FILTER_WRONG',
  // Chapter 12: indexes, plans and anti-patterns.
  'FUNCTION_ON_INDEXED_COLUMN', 'INDEX_WRONG_COLUMN', 'INDEX_MISSING', 'LEADING_WILDCARD', 'SELECT_STAR_COST',
  // Chapter 13: interview patterns.
  'LATEST_TIE_BREAK', 'STREAK_GAP_MISSED', 'MONTH_BOUNDARY_TZ', 'COHORT_DENOMINATOR', 'PIVOT_CASE_ELSE', 'SECOND_HIGHEST_RANK',
  // Step 3b review: rules that a variant must break on its own.
  'TIE_BREAK_REVERSED', 'COHORT_SAME_MONTH', 'RERUN_CHANGES_ROWS', 'INDEX_COLUMN_ORDER',
  // Rule sweep: a required filter, row limit or outer-join keep is missing.
  'FILTER_MISSING', 'LIMIT_MISSING',
  // A value is read from the wrong table (for example shipment events instead of shipments).
  'WRONG_SOURCE',
  // A value is set to the wrong content, such as the wrong status or a different timestamp.
  'WRONG_VALUE',
] as const;
export type MistakeTag = typeof mistakeTags[number];
// rule: the declared rule (Challenge.rules) this variant breaks and no other. Every declared rule needs at least one such variant.
export interface WrongVariant { id: string; sql: string; mistake: MistakeTag; explanation: string; rule?: string }
// A rule the ticket states. Its id is what a wrong variant names in rule; its text is the sentence the learner reads.
export interface TicketRule { id: string; text: string }

// sample: the Step 1 showcase tickets. guided: fill-in-the-blank. independent: a colleague's ticket.
// boss: one part of a multi-part ticket (bossGroup names the group).
export type Role = 'sample' | 'guided' | 'independent' | 'boss';
// How the starter is written: skeleton (a bare skeleton, write and window tickets), blanks (fill-in blanks, guided), broken (a real broken starter, fix tickets), empty (no starter; index tickets).
export type StarterStyle = 'skeleton' | 'broken' | 'blanks' | 'empty';

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
  // The rules the instructions state. Each needs a wrong variant whose rule names it (tests/content.test.ts).
  rules?: readonly TicketRule[];
  hints: readonly [string, string, string];
  docs: readonly { label: string; url: string }[];
  datasets: readonly DatasetSpec[];
}
export interface ResultDiff { passed: boolean; message: string; missing: unknown[][]; extra: unknown[][] }
export interface DatasetOutcome { id: string; label: string; hidden: boolean; passed: boolean; diff: ResultDiff }
export interface MistakeFeedback { id: string; mistake: MistakeTag; explanation: string }
export interface GradeReport { passed: boolean; outcomes: DatasetOutcome[]; elapsedMs: number; error?: string; mistake?: MistakeFeedback }
