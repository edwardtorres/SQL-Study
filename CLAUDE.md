# Larkspur SQL Desk working rules

## Scope and source of truth

Read `docs/step-1-prompt.md` and `docs/implementation-plan.md` before working.
Step 1 implements a three-ticket game, typed curriculum, deterministic freight
data, grader, warm worker and versioned saves. Full lessons and the rank/skill
tree loop remain later steps. Local Chromium and WebKit engine checks execute;
consult current reports and CI outcomes before making readiness claims.
The user explicitly removed WebKit as a prerequisite to building the game.

Use the existing checkout. Cloud tasks are isolated; do not create a worktree
unless the user explicitly requests one.

## Stack and integrity

Game stack: Vite, React, strict TypeScript, Tailwind, CodeMirror 6,
Vitest, Playwright with axe, and a lazy browser PostgreSQL engine in a Web Worker.
The engine and editor load lazily with a SQL workspace; the board loads neither.
No backend. Use localStorage with versioned saves and tested migrations.
No remote fonts or external runtime origins; self-host assets and split by feature.
Use `wasm-unsafe-eval` in CSP for WASM; do not enable general `unsafe-eval`.

Keep package versions pinned and install with the committed lockfile. Preserve
TLS and artifact-integrity checks. Never invent test results or engine outputs.
Never commit tokens, private or session links, credential values, or machine-
specific absolute paths. Verify staged files before committing.

Author commits as Edward Torres with email
`12915571+edwardtorres@users.noreply.github.com`. Push at the end of each step
and confirm HEAD equals origin/main and the actual remote main. Never reset
or force-push user work to make that check pass.

## Audit after every prompt

End the final response to every user prompt with an audit, including small changes,
status-only replies, and work stopped by a blocker. Scale its length to the task.
State what changed or was completed, what checks actually ran and their results,
any untested work, uncertainties or deviations, and remaining blockers or next
steps. For repository changes, include the commit/push status and verify HEAD
against origin/main and remote main after pushing. Do not imply tests ran when
they did not. These per-prompt audits supplement the full end-of-step audits;
they do not authorize starting the next roadmap step without user approval.
Provide the audit directly in chat as Markdown. Do not commit or push an audit
file unless the user explicitly requests it. Technical evidence and ordinary
project documentation remain part of the repository.

## Apply lessons from previous study apps

- Shuffle multiple-choice options at render time, preserving stable option IDs.
- Debug/test hooks such as seed overrides work only in dev. A production bundle
  scan must prove hook markers absent. There are no debug hooks in the lab.
- React effects must always have block bodies; add a lint rule before using
  effects, preventing accidental return of a Promise or other invalid cleanup.
- Self-host fonts, use no external runtime origins, split by feature, and load
  the SQL engine lazily.
- From the first game UI step, commit Playwright e2e specs with axe at phone and
  desktop widths, and exercise tap-only and keyboard flows.
- A separate agent must review content it did not write: solve challenges blind,
  then check explanations against official documentation. Do not call an
  author-only review independent.

## Accuracy, grading and pedagogy

All result examples must come from engine execution. Cite official PostgreSQL
docs for explanations and Microsoft Learn plus Apache Spark/Databricks docs for
dialect differences. Story people and data are invented. The company-name web search found no exact freight/logistics match; see
`docs/name-check.md` for its scope and remaining uncertainty.

Each chapter is lesson with editable example → guided practice → independent
tickets → boss. Mastery requires a boss pass. Hints cost XP but never block
access; solutions unlock on request or after three failures, with reduced XP.
Use sample plus at least two hidden edge-case datasets per challenge. Compare
multisets unless order is required; parse SQL for structural requirements.
Use one warm worker with retained per-dataset schemas. Run every learner and
reference inside BEGIN/ROLLBACK with restricted dataset roles, search_path and
statement_timeout. Use main-thread worker deadlines and row caps. Show bounded diffs, not full
hidden datasets. All references must pass and all test sets must catch a
deliberately wrong variant. Fixtures are deterministic and small.

Step 2 rules (enforced by the content check and its Vitest suite):
- Every wrong variant must be caught by at least two datasets, not one.
- Every graded item has at least two wrong variants, each tagged with a mistake
  from the taxonomy in `src/core/types.ts` (`mistakeTags`). Each tag has a targeted
  explanation that appears when a submission returns exactly that variant's rows.
- Write-query tickets (independent, boss, and the Step 1 write and window samples)
  get a bare skeleton starter at most. Only fix-the-bug tickets get a broken
  starter. The check parses the starter and rejects WHERE, JOIN, GROUP, ORDER,
  LIMIT, WITH, OVER, CASE, and aggregates.
- Every item has three hint tiers (nudge, approach, partial query).
- Lesson claims are checked against the cited pages. Quotes in `src/data/citations.json`
  must appear verbatim on the live page; `scripts/verify-quotes.mjs` checks this.
- At least one wrong variant per graded item must fail on the visible sample, not only
  on hidden datasets. A learner can then see a wrong answer without any hidden data.
- A lesson claim with no verbatim documentation quote is shown as a demonstration:
  a runnable example labeled "Demonstrated by the engine", run by the content check.
- Hidden datasets are seeded after the editor is ready. A Submit waits for them if needed.

## Step 3 rules (write tickets, constraint tests, transactions)

- Each ticket declares a `policy`: an allow-list of statement kinds (libpg-query node
  names). Read tickets default to `SelectStmt`. Session and server statements (SET, DO,
  COPY, roles, GRANT, LOCK, VACUUM, PREPARE, LISTEN, schema-qualified names) are refused
  in every ticket, whatever its policy.
- A write ticket (one with `checks`) is graded by database state, not rows. The grader
  runs the learner's statements, then the trusted `checks` (information_schema and
  pg_constraint reads, or table contents), then each `constraintTests` entry, all inside
  one transaction that is rolled back. The reference runs through the same path on every
  dataset. A state that differs from the reference's state fails the dataset.
- A constraint test runs its statement in a savepoint and states `expect: 'ok'` or
  `'error'`. An error test names a SQLSTATE class (two characters, such as `23`) or an
  exact code (such as `23505`). Every test must pass on the reference.
- `policy.transactions: true` adds TransactionStmt to the allow-list. The learner's
  BEGIN, COMMIT, ROLLBACK and savepoints are translated onto savepoints inside the grader's
  transaction, so a learner's COMMIT never reaches the real transaction. Isolation levels,
  READ ONLY, DEFERRABLE, AND CHAIN and two-phase commit are refused.
- Bare skeletons apply to write tickets too: CREATE TABLE with no column list, or a DML
  statement with no WHERE, subquery, join or ordering.
- Every write-ticket wrong variant must change the state on at least two datasets, and at
  least one of them must change it on the visible sample.
- Every lesson example and predict count is checked by the content test; examples are
  read-only and cannot name another schema.
- Chapter 9 DDL and transaction tickets are blind-reviewed with the constraint names and
  expected outcomes, not the probe statements. Reviewers write their own probes.

## Execution findings and cross-browser checks

- PGlite is the PostgreSQL engine. No optional extension archives are shipped.
- Retain CSP `wasm-unsafe-eval`; never add general `unsafe-eval` to silence build
  warnings. PGlite's distribution emits eval warnings, but tested browser paths
  work under the policy. Runtime resources and fonts are same-origin.
- Preserve PGlite.defaultStartParams when tuning PostgreSQL. shared_buffers=16MB,
  work_mem=4MB and maintenance_work_mem=16MB lower allocated WASM memory to 128 MiB.
  The compiled minimum is 128 MiB; initialMemory 64 MiB fails instantiation.
- statement_timeout is set but did not interrupt pg_sleep in this WASM build.
  The main thread must terminate a runaway worker. Restart only after deadline,
  crash or memory failure, not ordinary SQL mistakes or ticket navigation.
- Compare on all 3 datasets; cap results before transferring them to the UI.
  Use savepoints for independent constraint probes in schema tickets.
- CI installs both browsers with --with-deps and tests both browser projects.
  The documented local user-space-library preflight switch skips no actual tests
  and must not be copied into CI or used without the real library/render checks.
- Keep the dev-only seed module behind import.meta.env.DEV. The production scan
  proves known seed/debug markers absent; do not expose test globals in releases.

## Required competency coverage

1. SELECT/FROM/WHERE/ORDER BY/LIMIT/DISTINCT, aliases, comparison/logical operators,
   LIKE, IN, BETWEEN.
2. IS NULL, COALESCE, three-valued logic, NULL in joins and aggregates.
3. COUNT/SUM/AVG/MIN/MAX, GROUP BY, HAVING, COUNT(*) vs COUNT(column).
4. Inner/left/right/full/self joins, anti-joins including NOT EXISTS, multi-table
   joins, and row explosion.
5. Scalar/IN/EXISTS/correlated subqueries, WITH, nested-query refactoring.
6. CASE, string/date/time functions and casts.
7. UNION/UNION ALL/INTERSECT/EXCEPT.
8. ROW_NUMBER/RANK/DENSE_RANK/LAG/LEAD, running totals and moving averages with
   frames, top-N per group and deduplication.
9. CREATE TABLE, types, primary/foreign keys, NOT NULL/UNIQUE/CHECK, INSERT,
   UPDATE, DELETE, transactions.
10. Normalization, star schema, facts/dimensions, surrogate keys.
11. ON CONFLICT/MERGE, incremental loads, SCD2, duplicate/orphan/null/range
    quality checks, views.
12. Indexes, basic EXPLAIN and obvious performance anti-patterns.
13. Timed multi-part entry-level interview screens.

## Roadmap: require approval between steps

1. Engine evidence; curriculum data; freight seed/schema; grader; three sample
   tickets; minimal editor/schema UI; version-1 saves; audit. Final validation.
2. Chapters 1–6 content and blind review.
3. Chapters 7–13 content, dialect notes and blind review.
4. Skill tree, ranks (Intern → Junior Analyst → Analyst → Junior Data Engineer →
   Data Engineer I), XP, streaks, badges, mastery, competency readiness.
5. Spaced review, Weak Spots and timed interview mode.
6. PWA/offline engine cache, save protection, accessibility and Lighthouse.
7. Deploy to the user's requested domain using the later approved deployment
   pattern, plus full README. No deployment work in Step 1.

Stop at the Step 1 audit. Do not start Step 2 until the user approves.
