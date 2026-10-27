export interface Field { name: string; dataTypeID: number }
export interface QueryResult { fields: Field[]; rows: unknown[][] }
export interface ColumnRule { name: string; type: number }
export type Variant = 'sample' | 'nulls' | 'ties' | 'boundary' | 'empty' | 'nulltext';
export interface DatasetSpec { id: string; label: string; hidden: boolean; seed: number; variant: Variant }
export type Structure = 'window' | 'cte';

// Mistake tags name the beginner error a wrong variant models. Every wrong variant carries one.
export const mistakeTags = [
  'GE_VS_GT', 'COUNT_STAR_VS_COL', 'MISSING_GROUP_COL', 'LEFT_TO_INNER', 'NULL_EQUALS',
  'NOT_IN_NULL', 'JOIN_FANOUT', 'TIE_NONDETERMINISTIC', 'WHERE_VS_HAVING', 'AND_OR_PRECEDENCE',
  'BETWEEN_END_BOUND', 'INTEGER_DIVISION', 'LIKE_CASE', 'LIKE_WILDCARD', 'DISTINCT_MISUSE', 'CORRELATED_SCOPE',
  'ORDER_DIRECTION', 'NULL_AS_DEFAULT', 'NULL_NO_FALLBACK', 'COALESCE_ORDER', 'AGGREGATE_CHOICE', 'JOIN_KEY',
  'CASE_ORDER', 'STRING_INDEX', 'CONCAT_NULL', 'TIMEZONE_ASSUMED', 'CAST_ROUNDING',
] as const;
export type MistakeTag = typeof mistakeTags[number];
export interface WrongVariant { id: string; sql: string; mistake: MistakeTag; explanation: string }

// sample: the Step 1 showcase tickets. guided: fill-in-the-blank. independent: a colleague's ticket.
// boss: one part of a multi-part ticket (bossGroup names the group).
export type Role = 'sample' | 'guided' | 'independent' | 'boss';

export interface Challenge {
  id: string;
  chapterId: number;
  role: Role;
  bossGroup?: string;
  title: string;
  // write: a bare skeleton at most. fix: a real broken starter. guided: fill-in blanks.
  kind: 'write' | 'fix' | 'window' | 'guided';
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
  hints: readonly [string, string, string];
  docs: readonly { label: string; url: string }[];
  datasets: readonly DatasetSpec[];
}
export interface ResultDiff { passed: boolean; message: string; missing: unknown[][]; extra: unknown[][] }
export interface DatasetOutcome { id: string; label: string; hidden: boolean; passed: boolean; diff: ResultDiff }
export interface MistakeFeedback { id: string; mistake: MistakeTag; explanation: string }
export interface GradeReport { passed: boolean; outcomes: DatasetOutcome[]; elapsedMs: number; error?: string; mistake?: MistakeFeedback }
