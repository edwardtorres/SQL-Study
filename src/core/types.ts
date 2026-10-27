export interface Field { name: string; dataTypeID: number }
export interface QueryResult { fields: Field[]; rows: unknown[][] }
export interface ColumnRule { name: string; type: number }
export type Variant = 'sample' | 'nulls' | 'ties';
export interface DatasetSpec { id: string; label: string; hidden: boolean; seed: number; variant: Variant }
export type Structure = 'window' | 'cte';
export interface Challenge {
  id: string;
  chapterId: number;
  title: string;
  kind: 'write' | 'fix' | 'window';
  colleague: string;
  colleagueRole: string;
  summary: string;
  instructions: string;
  lesson: string;
  exampleSql: string;
  guidedSql?: string;
  starterSql: string;
  referenceSql: string;
  wrongSql: string;
  ordered: boolean;
  columns: readonly ColumnRule[];
  structure?: Structure;
  hints: readonly [string, string, string];
  docs: readonly { label: string; url: string }[];
  datasets: readonly DatasetSpec[];
}
export interface ResultDiff { passed: boolean; message: string; missing: unknown[][]; extra: unknown[][] }
export interface DatasetOutcome { id: string; label: string; hidden: boolean; passed: boolean; diff: ResultDiff }
export interface GradeReport { passed: boolean; outcomes: DatasetOutcome[]; elapsedMs: number; error?: string }
