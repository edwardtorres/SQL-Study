Step 1: Set up a new interactive game that teaches me SQL from zero to entry-level data engineer / data analyst job readiness, built around hands-on coding challenges. Start in plan mode and show me the plan before writing code.

Context: I'm a college student (informatics) targeting junior cloud/data roles. I've seen some T-SQL, KQL, and Spark SQL while studying for Microsoft and Databricks certs, but treat me as a SQL beginner. I study on an iPhone and on desktop browsers. The app should feel like a game, not a course site. It's built in steps, and each step ends with an audit that I review before the next one.

STACK
Vite + React + TypeScript (strict) + Tailwind. No backend; progress is saved in localStorage with a versioned save schema and migrations. Vitest from the start. Initialize a git repo.

GIT RULES
Commit as my GitHub noreply address: 12915571+edwardtorres@users.noreply.github.com. Never commit private links, session links, tokens, or local file paths. Push at the end of every step and confirm HEAD equals origin/main.

THE SQL ENGINE (decide this first, with evidence)
- Target dialect: PostgreSQL. Run a real engine in the browser: PGlite (Postgres compiled to WebAssembly) is the first choice, and DuckDB-WASM is the fallback.
- Before building anything else, run a spike. Load the current PGlite release; run CREATE TABLE, INSERT, a join, a CTE, a window function, and MERGE or INSERT ... ON CONFLICT; and measure the download size, startup time, and memory. Confirm it works in WebKit (Playwright's WebKit as the stand-in for iPhone Safari) and Chromium, and that it can run inside a Web Worker so the UI never freezes.
- Report the numbers and recommend PGlite or DuckDB in the plan. If neither works in WebKit, stop and tell me.
- CSP note for later: WebAssembly needs 'wasm-unsafe-eval' in script-src. Plan for it now.

WHAT "ENTRY-LEVEL READY" MEANS (the curriculum must cover all of this)
1. Basics: SELECT, FROM, WHERE, ORDER BY, LIMIT, DISTINCT, aliases, comparison and logical operators, LIKE, IN, BETWEEN.
2. NULL: IS NULL, COALESCE, three-valued logic, and NULLs in joins and aggregates.
3. Aggregation: COUNT, SUM, AVG, MIN, MAX, GROUP BY, HAVING, and COUNT(*) vs COUNT(column).
4. Joins: inner, left, right, full, self-joins, anti-joins (LEFT JOIN ... IS NULL, NOT EXISTS), joining many tables, and spotting row explosion from bad joins.
5. Subqueries and CTEs: scalar, IN and EXISTS subqueries, correlated subqueries, WITH, and refactoring nested queries into CTEs.
6. CASE, string functions, date and time functions, type casting.
7. Set operations: UNION vs UNION ALL, INTERSECT, EXCEPT.
8. Window functions: ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, running totals and moving averages with frames, top-N per group, deduplication.
9. Data definition and changes: CREATE TABLE, data types, primary and foreign keys, NOT NULL, UNIQUE, CHECK, INSERT, UPDATE, DELETE, transactions.
10. Modeling: normalization basics, star schema (facts and dimensions), surrogate keys.
11. Data engineering patterns: upserts (INSERT ... ON CONFLICT / MERGE), incremental loads, slowly changing dimension type 2, data quality checks (duplicates, orphans, nulls, ranges), and views.
12. Performance basics: indexes, reading EXPLAIN at a beginner level, and avoiding obvious anti-patterns.
13. Interview readiness: timed multi-part problems in the style of entry-level SQL screens.
Each chapter ends with short dialect notes on how T-SQL and Spark SQL differ (for example TOP vs LIMIT, ISNULL vs COALESCE), sourced from their official docs.

THE GAME: THE DATA DESK AT JUNIPER FREIGHT
I've just joined Juniper Freight, a fictional logistics company, as a data intern. Work arrives as tickets from colleagues: a sales manager wants a report, a dashboard query is broken, a load job created duplicates. Ranks go Intern → Junior Analyst → Analyst → Junior Data Engineer → Data Engineer I. Use only invented company and people names (check that the company name doesn't match a real freight company).

Each chapter (a skill-tree node with prerequisites) follows this flow:
1. A short lesson with a worked example I can run and edit.
2. Guided practice (fill-in-the-blank queries for early chapters).
3. Independent tickets.
4. A boss ticket (a multi-part realistic task).
Mastery gates the next chapter: pass the boss ticket. Rewards never replace passing tests.

Challenge types:
- Write the query from a ticket.
- Fix the broken query.
- Predict the output (computed by running the query, never hand-written).
- Refactor (same results, required structure such as a CTE or a window function instead of a self-join).
- Schema tickets (write DDL graded by test inserts that must succeed or fail).
- Data-cleaning tickets.
- Timed interview sets.

GRADING (the core, so get it right)
- The datasets are fictional and generated deterministically by seed scripts, kept small (hundreds to a few thousand rows).
- Each challenge has a visible sample dataset plus at least 2 hidden test datasets that cover edge cases (NULLs, ties, duplicates, empty results, boundary dates).
- A submission passes only if my query's result matches the reference query's result on every dataset. Compare as multisets unless the ticket requires an ORDER BY, and then compare order too. Column-name and type rules are stated per challenge.
- Structural requirements (for example "must use a window function") are checked by parsing the query, not by string matching.
- On failure, show which dataset failed, with a small diff (missing rows, extra rows, wrong values), never the hidden data in full.
- Hints are tiered (nudge → approach → partial query). They cost XP but never lock anything. The reference solution unlocks after 3 failed attempts or on request, and solving afterward earns reduced XP.
- Every reference solution must pass its own tests, and a test proves the reference fails at least one intentionally wrong variant (so the tests can catch mistakes).
- Queries run in a Web Worker with a time limit and a row limit, and a fresh database per run, so a bad query can't freeze the app or corrupt state.

EDITOR
A SQL editor (CodeMirror 6 or similar) with syntax highlighting, autocomplete for the current schema's tables and columns, and on phones a tappable keyword bar (SELECT, FROM, WHERE, JOIN, GROUP BY, and so on) so I don't have to type everything. A schema browser shows each table's columns, types, and sample rows. It works by tap and keyboard at 390 px with no page-level sideways scroll.

ACCURACY
- Explanations cite the official PostgreSQL documentation (postgresql.org/docs). Dialect notes cite Microsoft Learn (T-SQL) and the Apache Spark or Databricks SQL docs.
- The engine is the source of truth for every result. Never state a query result that wasn't produced by running it.

LESSONS FROM MY PREVIOUS STUDY APPS (record these in CLAUDE.md and apply them from the start)
- Shuffle any multiple-choice options at render time.
- Debug and test hooks (such as ?seed=) work only in dev builds, and a bundle check proves they're absent from production.
- React effects always use block bodies (a one-line effect that returned scrollTo()'s Promise crashed a page on current Chrome). Add a lint rule.
- Self-hosted fonts and no external origins. Code-split by feature; load the SQL engine lazily.
- Commit Playwright e2e specs with axe checks (both widths, tap only) from the first UI step.
- Content is reviewed by a separate agent that didn't write it: it solves challenges blind, then checks explanations against the docs.

THIS STEP BUILDS
1. The engine spike and its report.
2. The curriculum as data: chapters with prerequisites, learning objectives mapped to the competency list above, and planned challenge counts per chapter. Tests: the tree is acyclic and reachable, and every competency is covered.
3. The Juniper Freight schema and deterministic seed generator (a realistic schema of about 6–10 tables: customers, shipments, routes, warehouses, drivers, invoices, and so on), with tests that a seed always produces identical data.
4. The grader core (multiset and ordered comparison, the result diff, structural checks, time and row limits), with thorough unit tests.
5. Three complete sample challenges end to end (one beginner write-query, one fix-the-bug, one window-function ticket), playable in a minimal UI with the editor and schema browser.
6. The save system (schema version 1) and CLAUDE.md with the stack, rules, competency list, and roadmap.

ROADMAP (later steps; don't build yet)
2. Lessons and challenges for chapters 1–6, with blind review.
3. Chapters 7–13 and dialect notes, with blind review.
4. The game loop: skill tree map, ranks, XP, streaks, badges, mastery gating, readiness by competency.
5. Spaced review of missed concepts, a Weak Spots page, and the timed interview mode.
6. PWA and offline (cache the engine), save protection, accessibility, Lighthouse.
7. Deploy to sql.edwardtorres.dev, reusing my S3 + CloudFront + OIDC pattern from the SAA app, plus a README.

END OF STEP: AUDIT
Stop and give me an audit:
- The engine spike results and your recommendation.
- The curriculum tree, with the competencies each chapter covers.
- The schema diagram and seed design.
- The grader design and its test results.
- The three sample challenges, with their hidden-dataset edge cases.
- Anything you were unsure of, any deviation from this prompt, and test/check results. Confirm everything is pushed.
Don't start Step 2 until I approve.
