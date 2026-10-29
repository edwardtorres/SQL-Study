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

Commit identity: the author of every commit is Edward Torres
`<12915571+edwardtorres@users.noreply.github.com>`. The committer field does not
matter. Make commits with `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` set, leaving the
default committer. Never rewrite pushed history to change an author or committer.
Push at the end of each step and confirm HEAD equals origin/main and the actual
remote main. Never reset or force-push user work to make that check pass.

Scope: concurrent sessions and isolation levels are out of scope for the whole
curriculum. The transaction translation models one session.

Blind-solve rule: no graded item ships until a blind solver agrees with its reference
on every dataset that item uses. `tests/blind-compare.test.ts` runs that comparison over
every `docs/reviews/blind/<set>/` folder as part of `npm test`.

Branch rules: work-in-progress commits may go to the designated branch when the stop hook
asks for them. `main` is fast-forwarded to the designated branch head only after the full
checks pass: lint, unit tests, build, production scan, the full Chromium e2e suite, and
CI on that head in both browsers.

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

Every audit includes every section the step prompt requests, under the heading the prompt gives.
If a section cannot be filled, keep its heading and say exactly why it is empty. An audit that
omits a requested section is incomplete, even when its other sections are accurate.

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
  get a bare skeleton starter at most, or an empty starter (`starterStyle: 'empty'`) for
  index tickets. Only fix-the-bug tickets get a broken starter. The check parses the
  starter and rejects WHERE, JOIN, GROUP, ORDER, LIMIT, WITH, OVER, CASE, and aggregates.
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
  statement with no WHERE, subquery, join or ordering. A starter may hold several
  statements, and each one must be bare. A CREATE VIEW starter is judged by its query.
  A bare index skeleton does not parse, so index tickets use `starterStyle: 'empty'`
  (a blank editor) and are graded by catalog state.
- Every write-ticket wrong variant must change the state on at least two datasets, and at
  least one of them must change it on the visible sample.
- Every lesson example and predict count is checked by the content test; examples are
  read-only and cannot name another schema.
- Chapter 9 DDL and transaction tickets are blind-reviewed with the constraint names and
  expected outcomes, not the probe statements. Reviewers write their own probes.

## Step 3b rules (coverage, idempotency, starters)

- **Coverage rule.** Every rule a ticket states is declared in the item's `rules` list, with
  an id and the sentence the learner reads. Each declared rule needs at least one wrong
  variant whose `rule` names it, and that variant must be caught by at least two datasets.
  Instruction words that state a rule (NULL, missing, no, left out, zero, tie, equal, once,
  twice, repeat, at least, at most, exactly, first, next, latest, boundary, distinct, second
  run) are listed in `tests/rules-lint.ts`, and an item that uses one must declare a rule.
  The grader cannot prove that a variant breaks only its own rule. Each blind solver records
  how it read every declared rule, and the variant is reviewed against that reading.
- **Idempotency wording.** A ticket whose load runs twice says so in its instructions: the
  table is created once, and the load runs twice in a row. The second run must succeed and
  leave the same rows, or add nothing, as the ticket says.
- **Edge cases stay in hidden data.** An edge case is added only inside the hidden variants
  named for it in `src/data/seed.ts` (`applyEdgeCases`, `addStaging`). The visible sample is
  never changed by an edge case, so lesson predicts and the sample stay fixed.
- **Re-solving.** A ticket whose instruction text, dataset list or wrong variants change is
  re-solved blind by a fresh agent, and its earlier record moves to `superseded/` with the
  reason. A change only to hidden data is verified by re-running `tests/blind-compare.test.ts`.

## Game loop rules (Step 4)

The rules are pure functions in `src/game/rules.ts`. The numbers below are the source of truth, and
`tests/game-rules.test.ts` pins them. Save version 3 is in `src/save/` (format, migrations, progress, transfer).

**Gating and mastery.** Chapter 1 is open. Chapter n opens when chapter n−1 is mastered, and a mastered chapter
stays open. A chapter is mastered when every part of its boss has a counting pass. Mastery is kept once earned,
so a later reveal does not take it back. Each open chapter's boss can be attempted from the start.

**Test-out.** A chapter is marked *Mastered by test-out* when its boss passes before any of its lesson sections is
answered and before any of its non-boss tickets passes. Otherwise it is *Mastered*. Desks show *Locked*, *Open*,
*In progress*, *Mastered* or *Mastered by test-out*.

**Reveal rule.** Revealing never adds XP or mastery. A revealed boss part's pass is void, and the part counts again
only after a passing submission made after the reveal whose query differs from the solution. Queries are compared
after whitespace, letter case and a trailing semicolon are ignored. A revealed boss part passed with the reference
query is refused with a message. Revealing a guided, independent or sample ticket never blocks its pass; it only
sets the award.

**Ranks** come from mastery, not XP: Intern (start), Junior Analyst (chapter 3 mastered), Analyst (chapter 6),
Junior Data Engineer (chapter 9), Data Engineer I (chapter 13). A promotion card appears on the grade that changes
the rank.

**XP.** Sample tickets earn the independent award. Readiness scores only independent tickets and boss parts.

| Item type | Base XP | First-try bonus (first submission passes, no hints, no reveal) |
|---|---|---|
| Guided | 10 | +5 |
| Independent (and sample) | 25 | +10 |
| Boss part | 50 | +15 |

- The first pass sets the award. Each hint tier taken before it costs 5 XP, so 5, 10 and 15 in total. The award
  never falls below 0. Hints taken after the pass cost nothing.
- A pass after a reveal, on its first pass, earns a flat 5 XP.
- A repeat pass of an item already passed earns 1 XP, at most once per local day for that item.
- Passing never depends on XP.

**Levels** come from total XP. Level n starts at 100(n−1) + 25(n−1)(n−2) XP:

| Level | Starts at XP | Level | Starts at XP |
|---|---|---|---|
| 1 | 0 | 7 | 1,350 |
| 2 | 100 | 8 | 1,750 |
| 3 | 250 | 9 | 2,200 |
| 4 | 450 | 10 | 2,700 |
| 5 | 700 | 11 | 3,250 |
| 6 | 1,000 | | |

Each level needs 50 XP more than the one before.

**Streak.** A local calendar day counts once three different items pass on it. Repeat passes of one item count once.
Days are compared as calendar dates, so 1 November 2026 in a daylight-saving zone is one day. A missed day resets the
current streak, and the longest streak is kept.

**Badges** are never removed: each rank; Boss, first try (every part of a boss passed first try, with no hints and no
reveal); Ten in a row (ten independent first-try passes in a row); Window functions and Pipelines (every item in
chapter 8 or 11 passed with no reveal, hints allowed); a seven-day and a thirty-day streak; Every chapter mastered.

**Readiness.** The thirteen competencies are the thirteen chapters. Each scored attempt earns credit: a first pass by
how it was earned (first try 1.0, hinted or passed after failures 0.5, revealed 0), and a review attempt by its own
outcome (first try 1.0, a hint 0.5, a reveal or a failure 0). Each competency keeps its 10 most recent scored attempts.
A score shows only from 5 scored attempts, and below that it reads *Not enough data*. A competency is *ready* at 0.80
or above. The entry-level signal appears only when all 13 competencies are ready. Scored means independent and boss
tickets; guided and sample tickets are not scored.

**Migration.** A version 2 save keeps its passes and drafts. Its XP is recalculated under the table above. Its
outcomes are conservative: a pass after failures or hints is hinted, and a pass after a reveal is revealed. A revealed
boss part is void until it passes again. Streaks and runs start at zero, and badges are derived with time 0. A version
3 save carries every field over; its readiness window is seeded from its first passes, so its scores do not move.

## Spaced review (Step 5)

Schedules live in `src/game/review.ts`; the numbers are pinned by `tests/review.test.ts`.

**Intervals.** A ticket and each mistake tag it models keep a schedule. The intervals are 1, 2, 4, 7, 14 and 30 days.
A pass steps to the next interval, capped at 30 days. A miss (a failed attempt, or a reveal) resets to step 0, due the
next day. A tag's schedule starts at its first logged mistake, and a review pass of a ticket advances the schedule of
each tag it models.

**Mistake log.** Every failed and revealed attempt is logged with the mistake tag its wrong variant matched, or no tag.
The log keeps the last 500 entries. Totals per tag and per competency are kept separately and never trimmed.

**Daily Review.** At most 5 tickets per local day. The set is saved the first time the page opens that day, so a reload
does not reshuffle it. Due tags come first, oldest due first. Each picks one seen ticket that models the tag, not the
ticket failed most recently for it, and preferring the one passed longest ago. The set is then topped up from the
weakest competency. A ticket never seen is not offered.

**Needs review.** Over a competency's last 5 review attempts (at least 5 are needed), a pass rate below 60% shows a
*Needs review* mark on its desk. A pass is a first try or a hinted attempt; a reveal is a miss. Mastery is never changed.

**Weak Spots.** Competencies ranked by readiness, weakest first, with the attempts each rests on. The five most frequent
mistake tags. Revealed tickets, most recent first, and tickets that have failed without a pass.

**Review samples.** A review opens a ticket on one of four review samples (`reviewSamples` in `src/data/datasets.ts`,
labelled Review sample A to D). The sample is chosen by the ticket's attempt count, so it rotates after each attempt and
cannot be remembered. A review never runs on the visible sample. `tests/review-pool.test.ts` runs every item on every
review sample: the reference passes, and at least one wrong variant changes the result there.

**Review attempts.** A review pass adds one readiness attempt at its credit: a first try 1, a hint or a pass after a
failure 0.5, a reveal 0. A failed review adds an attempt at 0. A review pass that follows another review pass of the same
ticket on the same local day, with no miss between, changes nothing, so a reload cannot add credit. A review pass earns the usual award under the
Game loop table: a first pass earns its award, and any later pass earns the repeat XP. Mastery is never changed by a review.

**Pages.** Daily Review and Weak Spots are on the office map. A desk with a *Needs review* mark has a *Review this desk*
button, which lists the three seen tickets in that desk passed longest ago.

## Timed interview (Step 5)

The interview reserve is ten problems in `src/data/interview`, kept apart from the chapters. Each reserve problem scores
toward its primary competency (`chapterId`) and carries an estimate in whole minutes. Pure rules are in
`src/game/interview.ts`; `tests/interview.test.ts` pins them.

**Draw.** A set has three problems. The reserve comes first, unseen problems before seen ones. Only if the reserve runs out
does the draw take chapter 13 independent tickets, then independent tickets from mastered chapters 4 to 12 (the multi-concept
group). A problem is seen once it has an attempt or sat in a finished set.

**Time limit.** The sum of the problems' estimates, rounded up to a whole minute. A reserve problem declares its own estimate,
and so does a chapter 13 ticket (its `estimatedMinutes`, copied into the item index and pinned by tests/item-index.test.ts).
Any other chapter ticket is timed at the independent default, 6 minutes. Each problem keeps the estimate it started with.

**Solve time.** Each problem records `spentMs`: the time its workspace was open inside the set, before it passed. Time is counted
when the workspace closes, when the problem passes, and at a checkpoint every 30 seconds while it is open. A reload clears the
open marker without counting, so it loses at most 30 seconds. Results show each problem's estimate and time. "Estimates vs your
times" on the interview page gives each timed problem's median over the finished sets, and marks it off when the median is more
than half away from the estimate. Results from a version 4 save show the time as not recorded.

**Timer.** The deadline is the saved start time plus the limit, so a reload keeps the time left. When the deadline passes,
the set ends on its own. The page grades each unpassed problem's saved draft once the engine is ready, and a draft that
passes counts as passed at the deadline. A set that expired while the page was closed is settled the same way on open.

**Inside a set.** Run is allowed. Submit reports pass or fail only. Hints, reveals, the detailed grade card and the mistake
explanations are not shown. The reference and the explanations appear on the results page, after the set ends.

**Scoring.** Each problem adds one readiness attempt when the set ends: 1 for a first-time pass, 0.5 for a pass after
failures, 0 for a problem not passed (including one the timer ended). A pass earns the independent award, and a later pass of
the same problem earns the repeat award once a day. Passed problems count toward the streak. Mastery, the mistake log and
the review schedules are never changed by an interview.

**Interview-ready.** At least two of the last three finished sets were submitted by the learner in time, and every problem in
each of them passed. A set the timer ended never counts.

**Short set (development only).** One problem and two minutes, behind `import.meta.env.DEV`. The production scan forbids its
marker, `__SQL_DESK_SHORT_SET__`. `e2e/interview-dev.spec.ts` covers it through the `dev-interview` project, which runs
against the dev server.

**Deviations from the Step 5 plan.** The multi-concept group uses the chapter number (4 and later) instead of a generated
structural index. Chapter 13 estimates were not read until Step 5 Part A, which now reads them. The distinct-scan ticket (int-07)
replaced the planned DISTINCT ON latest-scan ticket, because the staging feed in the seed has no multi-scan ordering to test,
and chapter 8 already covers latest-per-group.

## Execution findings and cross-browser checks

Engine start (flake closed as machine contention, 2026-10-28). One full Chromium run at 390 px
saw the first "Run sample" stay disabled for 35 s, in two tests. The failure appeared only while
the blind-solve agents ran PGlite on the same machine. It did not reproduce afterwards: three
full Chromium runs on 44fe219 passed 31 of 31 each; 40 cold starts at 390 px (20 under six
CPU-bound processes) started in 4 to 6 s; five cold starts at 1280 px on the split build had a
median of 3.50 s. The cause is attributed to machine contention and is not confirmed. CI keeps
watching the e2e suite on every push. If a first start fails again, record its error context
and timing before changing anything.

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
