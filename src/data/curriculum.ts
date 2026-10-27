export interface Objective { id: string; title: string; competency: number }
export interface Chapter {
  id: number;
  title: string;
  prerequisites: readonly number[];
  competencies: readonly number[];
  objectives: readonly Objective[];
  plannedChallenges: { guided: number; independent: number; boss: number };
  dialectNotes: readonly { dialect: 'T-SQL' | 'Spark SQL'; note: string; source: string }[];
  sources: readonly { label: string; url: string }[];
}

export const competencyObjectives: Readonly<Record<number, readonly string[]>> = {
  1: ['select-from', 'where', 'order-limit', 'distinct-aliases', 'comparison-logic', 'like-in-between'],
  2: ['is-null', 'coalesce', 'three-valued-logic', 'null-joins-aggregates'],
  3: ['count-sum-avg-min-max', 'group-by', 'having', 'count-star-vs-column'],
  4: ['inner-left-right-full', 'self-join', 'anti-left-null', 'anti-not-exists', 'many-tables', 'row-explosion'],
  5: ['scalar-subquery', 'in-exists-subquery', 'correlated-subquery', 'with-cte', 'refactor-cte'],
  6: ['case', 'strings', 'date-time', 'casts'],
  7: ['union-vs-union-all', 'intersect', 'except'],
  8: ['row-number-rank-dense-rank', 'lag-lead', 'running-total', 'moving-average-frames', 'top-n-per-group', 'window-deduplication'],
  9: ['create-types', 'primary-foreign-keys', 'not-null-unique-check', 'insert-update-delete', 'transactions'],
  10: ['normalization', 'star-facts-dimensions', 'surrogate-keys'],
  11: ['on-conflict-merge', 'incremental-load', 'scd-type-2', 'quality-duplicates-orphans-nulls-ranges', 'views'],
  12: ['indexes', 'beginner-explain', 'performance-antipatterns'],
  13: ['timed-multipart-interviews'],
};

const titles: Readonly<Record<string, string>> = {
  'select-from': 'Read columns and tables with SELECT and FROM', where: 'Filter rows with WHERE',
  'order-limit': 'Sort deterministically and limit results', 'distinct-aliases': 'Use DISTINCT and column aliases',
  'comparison-logic': 'Combine comparisons with AND, OR and NOT', 'like-in-between': 'Filter with LIKE, IN and BETWEEN',
  'is-null': 'Test missing values with IS NULL and IS NOT NULL', coalesce: 'Choose fallbacks with COALESCE',
  'three-valued-logic': 'Explain TRUE, FALSE and UNKNOWN', 'null-joins-aggregates': 'Reason about NULLs in joins and aggregates',
  'count-sum-avg-min-max': 'Calculate COUNT, SUM, AVG, MIN and MAX', 'group-by': 'Group rows at the correct grain',
  having: 'Filter groups with HAVING', 'count-star-vs-column': 'Distinguish COUNT(*) from COUNT(column)',
  'inner-left-right-full': 'Choose INNER, LEFT, RIGHT and FULL joins', 'self-join': 'Join a table to itself',
  'anti-left-null': 'Find unmatched rows with LEFT JOIN and IS NULL', 'anti-not-exists': 'Express anti-joins with NOT EXISTS',
  'many-tables': 'Join multiple tables at explicit grains', 'row-explosion': 'Spot and repair join row explosion',
  'scalar-subquery': 'Use scalar subqueries safely', 'in-exists-subquery': 'Use IN and EXISTS subqueries',
  'correlated-subquery': 'Reason about correlated subqueries', 'with-cte': 'Name intermediate results with WITH',
  'refactor-cte': 'Refactor nested queries into CTEs', case: 'Build conditional values with CASE',
  strings: 'Transform strings with PostgreSQL functions', 'date-time': 'Use date and timestamp functions at an explicit timezone',
  casts: 'Cast values deliberately', 'union-vs-union-all': 'Choose UNION or UNION ALL with duplicate semantics',
  intersect: 'Find shared rows with INTERSECT', except: 'Find differences with EXCEPT',
  'row-number-rank-dense-rank': 'Distinguish ROW_NUMBER, RANK and DENSE_RANK', 'lag-lead': 'Compare neighboring rows with LAG and LEAD',
  'running-total': 'Calculate running totals', 'moving-average-frames': 'Specify frames for moving averages',
  'top-n-per-group': 'Find top N rows per group', 'window-deduplication': 'Deduplicate with deterministic window ordering',
  'create-types': 'Create tables with appropriate data types', 'primary-foreign-keys': 'Enforce primary and foreign keys',
  'not-null-unique-check': 'Enforce NOT NULL, UNIQUE and CHECK', 'insert-update-delete': 'Insert, update and delete deliberately',
  transactions: 'Use BEGIN, COMMIT and ROLLBACK', normalization: 'Explain basic normalization',
  'star-facts-dimensions': 'Model fact and dimension tables in a star schema', 'surrogate-keys': 'Choose surrogate keys',
  'on-conflict-merge': 'Implement upserts with ON CONFLICT and MERGE', 'incremental-load': 'Design repeatable incremental loads',
  'scd-type-2': 'Preserve history with slowly changing dimensions type 2',
  'quality-duplicates-orphans-nulls-ranges': 'Check duplicates, orphans, NULLs and allowed ranges', views: 'Create reusable views',
  indexes: 'Choose basic indexes for common access patterns', 'beginner-explain': 'Read beginner-level EXPLAIN plans',
  'performance-antipatterns': 'Avoid obvious query performance anti-patterns',
  'timed-multipart-interviews': 'Solve timed, multi-part entry-level SQL screens and explain tradeoffs',
};

const chapterDefinitions = [
  ['Read the dispatch board', 5, 5, 'tutorial-select.html'],
  ['Missing is meaningful', 3, 4, 'functions-comparison.html'],
  ['Daily totals', 3, 5, 'tutorial-agg.html'],
  ['Connect the network', 4, 7, 'queries-table-expressions.html'],
  ['Queries within queries', 3, 5, 'queries-with.html'],
  ['Shape the report', 3, 5, 'functions.html'],
  ['Combine the feeds', 2, 4, 'queries-union.html'],
  ['Rank and compare', 4, 7, 'tutorial-window.html'],
  ['Own the data', 4, 6, 'ddl.html'],
  ['Model the warehouse', 2, 4, 'ddl-constraints.html'],
  ['Repair the pipeline', 3, 7, 'sql-insert.html'],
  ['Make it efficient', 2, 4, 'using-explain.html'],
  ['Interview dispatch', 1, 4, 'queries.html'],
] as const;

const dialectNotes: Readonly<Record<number, Chapter['dialectNotes']>> = {
  1: [
    { dialect: 'T-SQL', note: 'T-SQL uses TOP for a simple row cap; PostgreSQL uses LIMIT. Use ORDER BY when selecting a predictable subset.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/queries/top-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark SQL also supports LIMIT. An ORDER BY is needed for a predictable ordered subset.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-limit.html' },
  ],
  2: [
    { dialect: 'T-SQL', note: 'T-SQL has ISNULL as well as COALESCE; their typing and evaluation rules differ. Use this game’s PostgreSQL COALESCE examples as written.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/language-elements/coalesce-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark documents NULL-aware comparisons and null-safe equality separately; ordinary equality with NULL does not evaluate to TRUE.', source: 'https://spark.apache.org/docs/latest/sql-ref-null-semantics.html' },
  ],
  3: [
    { dialect: 'T-SQL', note: 'COUNT(*) counts rows, while COUNT(expression) counts non-NULL values in T-SQL too.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/functions/count-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark aggregate functions also distinguish row counts from non-NULL expression counts.', source: 'https://spark.apache.org/docs/latest/sql-ref-null-semantics.html' },
  ],
  4: [
    { dialect: 'T-SQL', note: 'T-SQL supports INNER and OUTER joins; always reason about join cardinality rather than assuming one row per entity.', source: 'https://learn.microsoft.com/en-us/sql/relational-databases/performance/joins' },
    { dialect: 'Spark SQL', note: 'Spark also has a direct LEFT ANTI JOIN syntax; this game teaches PostgreSQL NOT EXISTS and LEFT JOIN alternatives.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-join.html' },
  ],
  5: [
    { dialect: 'T-SQL', note: 'T-SQL supports WITH CTEs; a preceding statement in a batch must end with a semicolon.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/queries/with-common-table-expression-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark supports common table expressions with WITH as temporary named results within a statement.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-cte.html' },
  ],
  6: [
    { dialect: 'T-SQL', note: 'Date functions differ: T-SQL provides DATEADD; do not assume its syntax works in PostgreSQL.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/functions/dateadd-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark has its own catalog of date, timestamp and string functions. Check the documented function signatures before translating.', source: 'https://spark.apache.org/docs/latest/sql-ref-functions-builtin.html' },
  ],
  7: [
    { dialect: 'T-SQL', note: 'T-SQL UNION removes duplicates and UNION ALL retains them.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/language-elements/set-operators-union-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark supports UNION, INTERSECT and EXCEPT with duplicate-handling variants.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-setops.html' },
  ],
  8: [
    { dialect: 'T-SQL', note: 'ROW_NUMBER ordering can be nondeterministic when its ordering keys are not unique; include an explicit tie-breaker.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/functions/row-number-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark window specifications also define partitioning, ordering and frames. Spell out the frame for running calculations.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-window.html' },
  ],
  9: [
    { dialect: 'T-SQL', note: 'T-SQL has its own data-type and identity-column syntax. PostgreSQL schema tickets are graded against PostgreSQL constraints.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/statements/create-table-transact-sql' },
    { dialect: 'Spark SQL', note: 'Spark CREATE TABLE behavior depends on the data source and catalog; do not assume PostgreSQL-style constraint enforcement.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-ddl-create-table.html' },
  ],
  10: [
    { dialect: 'T-SQL', note: 'SQL Server primary and foreign keys express relational integrity; surrogate keys do not replace selecting the correct table grain.', source: 'https://learn.microsoft.com/en-us/sql/relational-databases/tables/primary-and-foreign-key-constraints' },
    { dialect: 'Spark SQL', note: 'Spark CREATE TABLE USING describes the storage table; a star schema is a modeling choice above the syntax.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-ddl-create-table-datasource.html' },
  ],
  11: [
    { dialect: 'T-SQL', note: 'T-SQL offers MERGE; PostgreSQL also offers INSERT ON CONFLICT. The syntax and concurrency details are engine-specific.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/statements/merge-transact-sql' },
    { dialect: 'Spark SQL', note: 'Databricks Delta supports MERGE; it is a Delta-table capability, not a promise that every Spark table supports upserts.', source: 'https://learn.microsoft.com/en-us/azure/databricks/delta/merge' },
  ],
  12: [
    { dialect: 'T-SQL', note: 'SQL Server execution plans use different operators and cost displays from PostgreSQL EXPLAIN.', source: 'https://learn.microsoft.com/en-us/sql/relational-databases/performance/execution-plans' },
    { dialect: 'Spark SQL', note: 'Spark EXPLAIN shows distributed plans. PostgreSQL index and scan advice does not directly describe Spark execution.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-qry-explain.html' },
  ],
  13: [
    { dialect: 'T-SQL', note: 'State the target dialect in an interview before using dialect-specific syntax such as TOP.', source: 'https://learn.microsoft.com/en-us/sql/t-sql/queries/select-transact-sql' },
    { dialect: 'Spark SQL', note: 'Explain both SQL result correctness and any distributed-execution assumptions when the interview specifies Spark SQL.', source: 'https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select.html' },
  ],
};

export const curriculum: readonly Chapter[] = chapterDefinitions.map(([title, guided, independent, page], index) => {
  const id = index + 1;
  return {
    id, title,
    prerequisites: id === 1 ? [] : [id - 1],
    competencies: [id],
    objectives: (competencyObjectives[id] ?? []).map((objective) => ({ id: objective, title: titles[objective] ?? objective, competency: id })),
    plannedChallenges: { guided, independent, boss: 1 },
    dialectNotes: dialectNotes[id] ?? [],
    sources: [{ label: `PostgreSQL: ${title}`, url: `https://www.postgresql.org/docs/18/${page}` }],
  };
});
