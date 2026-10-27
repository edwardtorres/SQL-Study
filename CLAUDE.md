# Juniper SQL Desk working rules

## Scope and source of truth

Read `docs/step-1-prompt.md` and `docs/implementation-plan.md` before working.
This repository currently contains the prerequisite engine lab, not a completed
game. WebKit engine validation is blocked by environment network access.
Do not infer browser compatibility from Node or Chromium results.

Use the existing checkout. Cloud tasks are isolated; do not create a worktree
unless the user explicitly requests one.

## Stack and integrity

Planned game stack: Vite, React, strict TypeScript, Tailwind, CodeMirror 6,
Vitest, Playwright with axe, and a lazy browser PostgreSQL engine in a Web Worker.
Only Vite/TypeScript/Vitest/PGlite/Playwright are installed for the engine lab.
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
dialect differences. Story people and data are invented. The provisional
company name still needs a real-company collision check.

Each chapter is lesson with editable example → guided practice → independent
tickets → boss. Mastery requires a boss pass. Hints cost XP but never block
access; solutions unlock on request or after three failures, with reduced XP.
Use sample plus at least two hidden edge-case datasets per challenge. Compare
multisets unless order is required; parse SQL for structural requirements.
Use fresh databases, worker deadlines and row caps. Show bounded diffs, not full
hidden datasets. All references must pass and all test sets must catch a
deliberately wrong variant. Fixtures are deterministic and small.

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
   tickets; minimal editor/schema UI; version-1 saves; audit. In progress.
2. Chapters 1–6 content and blind review.
3. Chapters 7–13 content, dialect notes and blind review.
4. Skill tree, ranks (Intern → Junior Analyst → Analyst → Junior Data Engineer →
   Data Engineer I), XP, streaks, badges, mastery, competency readiness.
5. Spaced review, Weak Spots and timed interview mode.
6. PWA/offline engine cache, save protection, accessibility and Lighthouse.
7. Deploy to the user's requested domain using the later approved deployment
   pattern, plus full README. No deployment work in Step 1.

Stop at the Step 1 audit. Do not start Step 2 until the user approves.
