# Part 0 backfill

This file records the facts requested for Part 0. Each fact comes from the repository, its git history,
CLAUDE.md, `docs/reviews/`, or a CI record. Where a fact could not be recovered, the section says so, and
nothing here is estimated.

**Sources.** `git log` and `git show` on `b793e96..7bafe3d`; `docs/reviews/part-a-diff.md`,
`docs/reviews/log.md` and `docs/reviews/blind/`; `src/game/*.ts`, `src/data/items/*.ts`,
`src/data/interview/items.ts`, `src/data/itemIndex.ts`; the AWS templates in `infra/`; `scripts/deploy/`;
`src/security/csp.ts`; CI runs 40802271557 and 40803939923 (both on `d665c0a`).

**How the coverage numbers were made.** The TypeScript under `src/` at `b793e96` and at `7bafe3d` was exported
with `git archive`, transpiled, and loaded. The challenge catalogue of each revision was dumped (declared
rules, wrong variants with their `rule` and `mistake`, and the hidden dataset list of each item), and the two
dumps were compared item by item. The loader and comparison ran in a scratch folder outside the repository.
The per-item result is Appendix B.

## 1. Step 4 Part A (`7bafe3d`)

### 1.1 What the range contains

Six commits, oldest first:

- `76201df` wip: Step 3b review fixes, sub-step 1 (fixture, coverage rule, edge cases, index ticket)
- `1054e22` wip: Step 3b rule sweep (all 95 flagged tickets), edge data, blind re-solves in progress
- `af87202` wip: blind re-solve records for the rule sweep (partial, batches A and B complete)
- `a3164cf` wip: blind re-solve record c8-i4 (chapter 8, still being written)
- `e3d3b96` wip: restore tie rules in chapters 6 and 8; blind re-solves for chapters 10 to 13
- `7bafe3d` Step 3b review fixes (Part A): staging fixture, coverage rule, edge data, blind re-solves

Across `src/`, `tests/` and `scripts/`, 22 files changed: 1,045 lines added and 269 removed. The commit
`7bafe3d` alone shows only four files, because the code changes were made in the commits before it.

### 1.2 Staging fixture change

The `7bafe3d` message reads: "Staging fixture: scan 1008 is restored; the feed's repeat of 1007 is kept."

**Affected items** (`docs/reviews/part-a-diff.md`). The file reports 66 existing items and 1 new item, `c12-i5`,
for 67 in all. Of the existing items, 63 have at least one changed reference outcome (11 of them write tickets,
judged on state), and 12 have a changed dataset list. The full table is Appendix A.

**Visible sample.** Five items changed on the visible sample, and the file gives the cause of each:

- `c9-b1-p3`: its trusted check now selects `note`. This changes the check definition, not the data.
- `c11-b1-p1`, `c11-g3`, `c11-i3`: the watermark and archive loads read staging, and scan 1008 is newer than the watermark.
- `c13-i1`: with scan 1008 restored, the islands change.

The lesson predict `c13-s2` also changed its answer from 9 to 10 (`src/data/lessons/ch13.ts`).

The `7bafe3d` message says "Edge data only in hidden variants (sample unchanged)". That sentence is about the edge
data. The five sample changes above come from the fixture and from one check definition, as the file records.

**Reconciliation.** The file says an earlier figure of 54 changed items was recorded during the Part A run. It
cannot be reproduced from the repository, the basis of that count is not recorded, and the file does not explain
the difference from 63.

### 1.3 Coverage gaps fixed: new rules, wrong variants and data

| | `b793e96` (before) | `7bafe3d` (Part A) |
|---|---|---|
| Items | 142 | 143 |
| Items that declare rules | 0 | 105 |
| Declared rules | 0 | 289 |
| Declared rules with at least one variant tagged with their id | not applicable | 289 of 289 |
| Wrong variants | 290 | 386 |
| Variants tagged with a rule | 0 | 307 (79 untagged) |

What changed on the existing items:

- 104 existing items gained declared rules, 287 rules in all. The new item `c12-i5` declares 2 more.
- 61 existing items gained wrong variants: 94 in all. `c12-i5` adds 2. Total additions: 96. Nothing was removed.
- 11 existing items changed their hidden dataset list. 12 datasets were added (`boundary` 3, `ties` 3, `nulltext` 2,
  `nulls` 2, `precision` 1, `empty` 1), and 4 were removed (`nulltext` 2, `nulls` 1, `ties` 1).
- No existing item changed its starter style.

**What "gap" means here.** The baseline declares no rules at all, so a gap at the baseline was a stated rule
with no declared rule and no breaking variant. The dump cannot count stated rules that were never declared.
The `1054e22` message says "all 95 flagged tickets", but the list of flagged tickets is not in the repository,
and 105 items declare rules at `7bafe3d`. The two counts are not reconciled.

**Edge data** (`src/data/seed.ts`, hidden datasets only, per the `7bafe3d` message): ties and boundary top
weights, single-weight customers, cohort months, a warehouse with no arrivals, NULL names and places in the flat
extract, range edges on 1 January and 1 February, missing weights, an exact 1800 kg queued shipment,
fractional-second events, and driver filters. The `precision` dataset is described in `part-a-diff.md`, item A3.

**Wording** (`part-a-diff.md`, A1 and the follow-up). Sixteen ticket phrases were reworded so that each keeps its
reference result. A fresh blind solver re-solved the 21 changed tickets, and all 21 agreed with their references
on every dataset they use (`docs/reviews/blind/rerun-a/compare.json`).

### 1.4 The chapter 12 index ticket `c12-i5`

- Title: "Index the scans for shipment lookups". Chapter 12, independent, starter style `empty` (a blank editor),
  policy `INDEX_ONLY`.
- Hidden datasets: `sample`, `nulls`, `boundary`.
- Declared rules: `covers-shipment-id` ("The index covers shipment_id.") and `shipment-id-first` ("shipment_id
  comes first, because the lookup starts from it.").
- Wrong variants: `i5-wrong-column` (rule `covers-shipment-id`, mistake `INDEX_WRONG_COLUMN`) and
  `i5-wrong-order` (rule `shipment-id-first`, mistake `INDEX_COLUMN_ORDER`).
- Blind solve: `CREATE INDEX ON shipment_scans_large (shipment_id, occurred_at);`, confidence high, two minutes.
  It ran cleanly on the sample and matched the reference on all three datasets.
- The solver saw only the rule text, so its rules are labelled `r1` and `r2` in declared order. The record says
  these need mapping to the declared ids by the lead. That mapping is not recorded in the file. The order matches
  by text, but the mapping has not been confirmed in writing.

### 1.5 Blind-solve results

- `docs/reviews/blind/` holds 196 JSON files. 74 are under `superseded/` folders, kept as history and not
  compared. The other 122 are in live folders, and 3 of those are compare summaries. That leaves 119 solve
  records, covering 114 distinct item ids. Confidence: 102 high, 17 medium. The records carry 130 ambiguity notes.
- Compare summaries, each with no disagreement and no error:
  - `docs/reviews/blind/compare.json`: 47 of 47 agree (run 2026-10-27).
  - `docs/reviews/blind/ch789/compare.json`: 24 of 24 agree (run 2026-10-27).
  - `docs/reviews/blind/rerun-a/compare.json`: 21 of 21 agree (run 2026-10-27), the re-solve of the 21 reworded tickets.
  - That is 92 entries in all.
- **Not covered by a saved entry:** 43 of the 114 item ids have no entry in any compare summary. For those, the
  check is `tests/blind-compare.test.ts`, which runs on every `npm test` and compares every live record in every
  folder. The unit-test step passed in CI on `d665c0a` (runs 40802271557 and 40803939923) and on `e62482c`. I did
  not find per-record results for those 43 ids in the repository, and I did not rerun the comparison separately
  for this report.

## 2. Game rules as built

Source: `src/game/rules.ts`, pinned by `tests/game-rules.test.ts`. The constants match CLAUDE.md.

### 2.1 XP

| Item type | Base XP | First-try bonus (first submission passes, no hints, no reveal) |
|---|---|---|
| Guided | 10 | +5 |
| Independent (and sample) | 25 | +10 |
| Boss part | 50 | +15 |

- Each hint tier taken before the first pass costs 5 XP. The award is floored at 0 (`awardFor`).
- A ticket is a first try when it has no failures and no hints (`outcomeOf`).
- A pass after a reveal earns a flat 5 XP on its first pass (`REVEAL_XP`).
- A repeat pass earns 1 XP, once per local day per item (`REPEAT_XP`, `repeatDay`). Later passes on the same day earn nothing.
- Reveal rule (`revealSolution`): a reveal adds no XP and no mastery. It sets the reveal flag, logs a miss, and
  resets the review schedule. A revealed boss part passed with the reference query is refused as a copy and earns
  nothing (`copyOfReveal`). A pass that differs from the solution counts again.

### 2.2 Levels

Level n starts at 100(n−1) + 25(n−1)(n−2) XP. Computed from that formula, levels 1 to 11 start at
0, 100, 250, 450, 700, 1,000, 1,350, 1,750, 2,200, 2,700 and 3,250 XP.

### 2.3 Ranks

Ranks follow mastery. Intern is the start. Junior Analyst follows chapter 3 mastered, Analyst follows chapter 6,
Junior Data Engineer follows chapter 9, and Data Engineer I follows chapter 13.

### 2.4 Mastery

A chapter is mastered when each of its boss parts has a counting pass (`chapterBossesPass`). The method is
decided by `masteryMethod`: a chapter whose non-boss tickets have no passes, and whose lessons have no answers,
is "Mastered by test-out". Any other mastered chapter is "Mastered".

### 2.5 Streak

A local calendar day counts once three different items pass on it (`STREAK_ITEMS` = 3). Repeat passes of one
item count once. A missed day resets the current streak, and the longest streak is kept.

### 2.6 Badges (11, `BADGES`)

- Ranks: Junior Analyst (chapter 3 mastered), Analyst (chapter 6), Junior Data Engineer (chapter 9), Data Engineer I (chapter 13).
- Boss, first try: every part of a boss passed on its first try, with no hints and no reveal.
- Ten in a row: a run of ten independent first-try passes (`longestRun` of 10 or more).
- Window functions: every item in chapter 8 passed with no reveal. Hints are allowed.
- Pipelines: every item in chapter 11 passed with no reveal. Hints are allowed.
- Seven-day streak, and thirty-day streak: the longest streak reaches 7 or 30.
- Every chapter mastered.

Badges are never removed.

## 3. Readiness

- **Competencies:** the 13 chapters. The office map computes readiness over the chapter ids it lists
  (`OfficeMap.tsx`, `readinessAll(save, chapters.map(...))`).
- **Scored attempts:** independent and boss tickets only (`isScored`). Guided and sample tickets are not scored.
- **Credit on a first pass** (`CREDIT`): first try 1; hinted, or passed after failures, 0.5; revealed 0.
- **Credit on a review attempt** (`reviewCredit`): first try 1; a hint 0.5; a reveal 0. A failed review adds an
  attempt at 0.
- **Window:** each competency keeps its 10 most recent scored attempts (`READINESS_WINDOW`).
- **Minimum:** a score appears from 5 scored attempts (`READINESS_MINIMUM`). Below that the desk reads
  "Not enough data · N of 5 scored" (`OfficeMap.tsx`).
- **Score:** the mean credit over the window. A competency is ready at 0.80 or above (`READY_AT`).
- **Entry-level signal:** shown only when all 13 competencies are ready (`entryLevelReady`).

## 4. Spaced review

- **Intervals:** 1, 2, 4, 7, 14 and 30 days (`REVIEW_INTERVALS`). A pass steps to the next interval, capped at 30
  days. A miss resets to step 0, due the next day (`scheduleAfter`).
- **Tag schedules:** a tag's schedule starts at its first logged mistake (`withMiss` with the tag). A reveal logs
  a miss with no tag.
- **Daily Review:** at most 5 tickets a local day (`DAILY_REVIEW_CAP`). The set is saved on first open that day, so
  a reload does not reshuffle it.
- **Needs review:** over a competency's last 5 review attempts (`NEEDS_REVIEW_WINDOW`), a pass rate below 60%
  (`NEEDS_REVIEW_BELOW`). With fewer than 5 attempts the mark never appears.
- **What counts as a pass:** any review credit above zero, so a first try or a hint. A reveal or a failure is a miss.
- **Mistake log:** the last 500 entries (`MISTAKE_LOG_CAP`). Totals per tag and per competency are kept apart and never trimmed.
- **Weak Spots:** the five most frequent mistake tags (`WEAK_TAG_COUNT`).
- **Review this desk:** three seen tickets in the desk, the ones passed longest ago (`NEEDS_REVIEW_SET_SIZE` = 3).

## 5. Timed interview

- **Reserve:** 10 problems in `src/data/interview/items.ts`. Their chapters are 3 (1 problem), 4 (2), 5 (1), 6 (1),
  7 (1), 8 (3) and 11 (1). Their estimates, in file order, are 5, 5, 6, 5, 6, 7, 7, 6, 5 and 6 minutes, 58 in all.
- **Set:** 3 problems (`INTERVIEW_PROBLEMS`).
- **Draw order** (`drawInterview`): first the reserve, then the chapter 13 independent tickets, then the independent
  tickets of mastered chapters 4 to 12 (the multi-concept group). Within each group, unseen problems come before
  seen ones, and each part is shuffled. Duplicates are skipped.
- **Seen:** a problem is seen once it has an attempt or appears in a finished set (`seen` in `src/game/interview.ts`).
- **Time limit:** the sum of the three estimates, rounded up to a whole minute, and at least 1 (`limitFor`).
- **Estimates:** a reserve problem declares its own. A chapter 13 ticket uses its declared `estimatedMinutes`:
  `c13-i1` 12, `c13-i2` 10, `c13-i3` 12, `c13-i4` 10. Any other ticket defaults to 6 minutes (`DEFAULT_MINUTES`).
  Each problem keeps the estimate it started with.
- **Solve time:** the time the workspace is open within the set, before the pass. It is checkpointed every 30
  seconds (`CHECKPOINT_MS` in `src/app/Interview.tsx`), so a reload loses at most 30 seconds.
- **Off estimate:** a problem whose median recorded time is more than 50% away from its estimate is marked
  (`OFF_ESTIMATE_SHARE` = 0.5).
- **Scoring when the set ends** (`interviewCredit`): passed with no failures, 1; passed after failures, 0.5;
  not passed, 0.
- **Interview-ready** (`interviewReady`): at least 2 of the last 3 finished sets were submitted in time and every
  problem in each of them passed (`READY_NEEDED` = 2, `READY_WINDOW` = 3). A set the timer ended never counts.

## 6. Step 5 end-to-end and accessibility results in both browsers (CI)

| CI run | Head | Job | Result |
|---|---|---|---|
| 40803939923 | `d665c0a` | PostgreSQL and game, Chromium (`123218274726`) | 69 passed (8.6 min). Every earlier step succeeded, including lint, unit tests, build, scan, engine checks, and tap journeys and accessibility at both widths. |
| 40803939923 | `d665c0a` | PostgreSQL and game, WebKit (`123218274576`) | 69 passed (7.7 min). The CI summary reports lint, unit, build, scan, engine and browser outcomes as success. |
| 40802271557 | `d665c0a` | PostgreSQL and game, WebKit (`123212916852`) | 69 passed (10.0 min). The CI summary reports lint, unit, build, scan, engine and browser outcomes as success. |

- The 69 tests include the axe checks. The specs that call `AxeBuilder` include `review.spec.ts` and
  `interview.spec.ts`, among others.
- The approved plan also records a local Chromium run of 69 of 69. That run is not in the repository, and I did not
  reproduce it here.

## 7. Deploy facts

### 7.1 Compression

**The AWS limit.** From the CloudFront developer guide, "Serve compressed files" page
(`https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html`):

- "CloudFront compresses objects that are between 1,000 bytes and 10,000,000 bytes in size."
- "The origin must include a `Content-Length` header in the response, which CloudFront uses to determine whether the size of the object is in the range that CloudFront compresses."
- "If the `Accept-Encoding` header is missing from the viewer request, or if it doesn't contain `gzip` or `br` as a value, CloudFront doesn't compress the object in the response."
- "When a response from an origin includes the `Content-Encoding` header, CloudFront doesn't compress the object, regardless of the header's value."
- "CloudFront only compresses objects that have one of the following values in the `Content-Type` response header:", followed by a list that includes `application/wasm` and `text/javascript`, and does not include `application/octet-stream`.

**Files in the build** (`dist/assets`, from the local production build). Only one file exceeds 10,000,000 bytes:
`pglite-C2k-M10h.wasm`, at 10,123,263 bytes, which is 123,263 bytes over the limit. I checked every file in `dist/`.

| File | Bytes | Content-Type as published | Within 1,000 to 10,000,000 bytes | Automatic compression |
|---|---|---|---|---|
| `assets/pglite-C2k-M10h.wasm` | 10,123,263 | `application/wasm` | No (over) | Not applied |
| `assets/pglite-C2k-M10h.wasm.br` | 3,042,065 | `application/wasm`, `Content-Encoding: br` | Yes | Not applicable, because the origin sets `Content-Encoding` |
| `assets/pglite-C2k-M10h.wasm.gz` | 3,452,854 | `application/wasm`, `Content-Encoding: gzip` | Yes | Not applicable, as above |
| `assets/pglite-k6Y9avCD.data` | 6,291,000 | `application/octet-stream` | Yes | Not applied: the type is not on the list |
| `assets/pglite-k6Y9avCD.data.br` | 1,296,945 | `application/octet-stream`, `Content-Encoding: br` | Yes | Not applicable |
| `assets/pglite-k6Y9avCD.data.gz` | 2,138,827 | `application/octet-stream`, `Content-Encoding: gzip` | Yes | Not applicable |
| `assets/libpg-query.wasm` | 1,717,872 | `application/wasm` | Yes | Would apply to an uncompressed response, but the function serves the sibling to any viewer that accepts `br` or `gzip` |
| `assets/libpg-query.wasm.br` | 285,511 | `application/wasm`, `Content-Encoding: br` | Yes | Not applicable |
| `assets/initdb-D3nwUMsW.wasm` | 395,242 | `application/wasm` | Yes | Same as `libpg-query.wasm` |

These sizes are from `dist/` at `e62482c`, built with the engine lab enabled. The engine files do not depend on that flag.

**What `publish.mjs` uploads** (`scripts/deploy/plan.mjs` and `scripts/deploy/publish.mjs`):

1. The plan is built from the files in `dist/`. A `.br` or `.gz` file is never planned on its own. It is planned
   only as a sibling of a file under `assets/`, as step 4 describes.
2. **Content-Type** comes from the file extension: `.html` `text/html; charset=utf-8`, `.js` `text/javascript; charset=utf-8`,
   `.css` `text/css; charset=utf-8`, `.wasm` `application/wasm`, `.data` `application/octet-stream`, `.woff2` `font/woff2`,
   `.json` `application/json`, `.webmanifest` `application/manifest+json`, `.png` `image/png`, `.svg` `image/svg+xml`,
   `.txt` `text/plain; charset=utf-8`. Anything else is `application/octet-stream`.
3. **Cache-Control** is `public, max-age=31536000, immutable` for a file under `assets/` whose name carries a content
   hash (eight characters before the extension). Everything else is `no-cache`. `libpg-query.wasm` has no hash, so
   it is `no-cache`.
4. **Precompressed siblings** are uploaded only for files under `assets/`. Each existing `.br` and `.gz` file gets
   its own object key, for example `assets/pglite-C2k-M10h.wasm.br`. It keeps the base file's Content-Type and
   Cache-Control, and it gets `Content-Encoding: br` or `gzip`. Siblings of pages, the worker and the manifest are not uploaded.
5. **The uncompressed original** is uploaded with no `Content-Encoding`.
6. **Order:** assets first, then the rest. Each object is one `aws s3 cp` with `--content-type`, `--cache-control`
   and `--only-show-errors`, plus `--content-encoding` on siblings.
7. **Then:** list the keys under `assets/`, delete the keys the plan does not name, and invalidate `/`,
   `/index.html`, `/404.html`, `/sw.js` and `/manifest.webmanifest`.

Nothing in this has run against AWS. The plan logic is covered by `tests/deploy-plan.test.ts`.

### 7.2 Deploy role

From `infra/sql-site.yaml`, resource `DeployRole`:

- **Trust:** the principal is the GitHub OIDC provider, which the stack creates when `CreateGitHubOidcProvider`
  is `true`, or the existing one named by `ExistingGitHubOidcProviderArn`. The action is `sts:AssumeRoleWithWebIdentity`.
  The conditions are `StringEquals`, with `token.actions.githubusercontent.com:aud` equal to `sts.amazonaws.com`, and
  `token.actions.githubusercontent.com:sub` equal to `repo:${GitHubRepository}:ref:refs/heads/main`. The default
  repository is `edwardtorres/SQL-Study`. There is no environment condition and no workflow-file condition.
- **Session length:** 3,600 seconds (`MaxSessionDuration`).
- **Permissions**, four actions and nothing else (`tests/infra.test.ts` asserts this list):
  - `s3:ListBucket` on the site bucket.
  - `s3:PutObject` and `s3:DeleteObject` on the bucket's objects (`bucket/*`).
  - `cloudfront:CreateInvalidation` on this distribution only.
- **Not granted:** `s3:GetObject`, any other S3 or CloudFront action, and any resource outside this bucket and distribution.
- **Note:** the trust covers a `workflow_dispatch` run from `main` too, because its `sub` claim is the same. That is
  how the rollback works, and it means any workflow run on `main` can assume the role.

### 7.3 Final CSP as served

The production preview (`vite preview`, run locally) served this header, identically on `/index.html` and on the
`.br` WebAssembly response:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```

- The source is `src/security/csp.ts`. The same string is in `infra/sql-site.yaml`, in the `ResponseHeadersPolicy`,
  and `tests/infra.test.ts` fails if the two differ.
- `style-src` allows `'unsafe-inline'` because CodeMirror injects style elements. No script is inline.
- The other headers the template sets: `Strict-Transport-Security` `max-age=31536000`, `X-Content-Type-Options` `nosniff`,
  `X-Frame-Options` `DENY`, `Referrer-Policy` `strict-origin-when-cross-origin`, `Permissions-Policy`
  `camera=(), microphone=(), geolocation=(), payment=(), usb=()`, and `Vary: Accept-Encoding`.
- **Live site: not checked.** The header that CloudFront will send comes from the response-headers policy, which is
  not deployed. No live check has been run.

## 8. Not recovered, or not verified

- **Step 2 to Step 7 prompts.** Not in the repository or in `docs/`. See `docs/prompts/README.md`.
- **The 95 flagged tickets** of the rule sweep (`1054e22`). The list is not in the repository.
- **The earlier figure of 54 changed items.** Not reproducible from the repository (see 1.2).
- **43 item ids with no saved compare entry** (see 1.5). The unit-test step covers them, but no per-record result is saved.
- **The 17 medium-confidence blind records.** Not individually reviewed in this report.
- **The 305.79 kB main-chunk figure** in the approved plan. Not in the repository (the plan says so).
- **The local Chromium count of 69 for Step 5.** Recorded in the approved plan, not in the repository.
- **The live site, the AWS account's own quotas, and the CloudFront header as served on the live site.** Not checked.

## Appendix A. Affected items (Part A)

From `docs/reviews/part-a-diff.md`, reproduced as it stands in that file.

| Item | Changed datasets | On visible sample | Dataset list change |
|---|---|---|---|
| `c1-b1-p1` | boundary | no | none |
| `c1-b1-p3` | ties | no | removed nulltext; added boundary |
| `c1-g1` | ties | no | none |
| `c1-g2` | boundary, ties | no | none |
| `c1-g3` | boundary | no | none |
| `c10-b1-p2` | boundary, nulls | no | none |
| `c10-b1-p3` | boundary, nulls | no | none |
| `c10-g2` | none | no | removed nulls; added ties |
| `c10-i3` | none | no | removed none; added nulltext |
| `c10-i4` | boundary, nulls | no | removed none; added nulltext |
| `c11-b1-p1` | boundary, nulls, sample | yes | none |
| `c11-b1-p2` | nulls, ties | no | none |
| `c11-b1-p3` | boundary, nulls | no | none |
| `c11-g3` | boundary, sample | yes | none |
| `c11-i3` | boundary, sample | yes | none |
| `c11-i5` | nulls | no | none |
| `c11-i6` | boundary | no | none |
| `c11-i7` | boundary | no | none |
| `c12-i2` | boundary | no | none |
| `c12-i5` | none | no | removed none; added sample, nulls, boundary |
| `c13-b1-p1` | nulls, ties | no | none |
| `c13-b1-p2` | boundary, ties | no | removed none; added nulls |
| `c13-b1-p3` | boundary, nulls | no | none |
| `c13-g1` | boundary, ties | no | none |
| `c13-i1` | boundary, nulls, sample | yes | none |
| `c13-i2` | boundary, nulls | no | none |
| `c13-i3` | boundary, nulls | no | none |
| `c13-i4` | boundary, nulls | no | none |
| `c2-i2` | boundary, nulls | no | none |
| `c3-b1-p1` | nulls | no | removed ties; added boundary, precision |
| `c3-b1-p2` | none | no | removed none; added empty |
| `c3-g2` | boundary, ties | no | none |
| `c3-i2` | boundary, nulls | no | none |
| `c3-i3` | boundary | no | removed nulltext; added nulls |
| `c3-i4` | ties | no | none |
| `c4-b1-p3` | boundary, nulls | no | none |
| `c4-i6` | boundary, nulls | no | none |
| `c4-i7` | nulls, ties | no | removed none; added boundary |
| `c5-b1-p1` | boundary | no | none |
| `c5-b1-p2` | nulls | no | removed none; added ties |
| `c5-b1-p3` | boundary | no | removed none; added ties |
| `c5-g1` | boundary, nulls | no | none |
| `c5-g3` | nulls, ties | no | none |
| `c5-i2` | boundary, nulls | no | none |
| `c5-i5` | boundary, nulls, ties | no | none |
| `c6-b1-p1` | boundary, nulls | no | none |
| `c6-b1-p2` | boundary, nulls | no | none |
| `c6-b1-p3` | nulls, ties | no | none |
| `c6-g1` | boundary, nulls | no | none |
| `c6-i1` | boundary, nulls | no | none |
| `c6-i3` | nulls, ties | no | none |
| `c6-i4` | nulls, ties | no | none |
| `c7-b1-p2` | ties | no | none |
| `c8-b1-p1` | boundary, ties | no | none |
| `c8-g1` | boundary, nulls | no | none |
| `c8-g2` | nulls, ties | no | none |
| `c8-g3` | boundary, ties | no | none |
| `c8-g4` | nulls, ties | no | none |
| `c8-i2` | nulls, ties | no | none |
| `c8-i5` | boundary, ties | no | none |
| `c8-i6` | boundary, ties | no | none |
| `c9-b1-p3` | boundary, sample, ties | yes | none |
| `c9-g2` | boundary, ties | no | none |
| `c9-i3` | boundary | no | none |
| `c9-i5` | boundary | no | none |
| `dispatch` | boundary, ties | no | none |
| `latest-event` | boundary, nulls, ties | no | none |

## Appendix B. Per-item coverage changes (Part A)

One row for each of the 104 existing items whose rules, variants or hidden datasets changed, and for `c12-i5`.
Rules listed are the declared rule ids. Variants show the variant id, its rule and its mistake tag. Dataset
columns list hidden datasets only; `sample` is not a hidden dataset.

| Item | Kind | Rules declared | Wrong variants added (id, rule, mistake) | Hidden datasets added | Hidden datasets removed |
| --- | --- | --- | --- | --- | --- |
| `c1-g2` | existing | at-least-500, queued-only | — | — | — |
| `c1-i1` | existing | start-b-included, end-d-included | — | — | — |
| `c1-i2` | existing | latest-deadline, tie-greater-id, ten-rows | i2-no-limit (ten-rows, LIMIT_MISSING) | — | — |
| `c1-i4` | existing | each-value-once, alphabetical | — | — | — |
| `c1-b1-p3` | existing | in-transit-only, heaviest-first, id-tie-ascending, weight-present, three-rows | b1p3-id-desc (id-tie-ascending, TIE_BREAK_REVERSED), b1p3-null-first (weight-present, NULL_AS_DEFAULT), b1p3-no-limit (three-rows, LIMIT_MISSING) | boundary | nulltext |
| `c10-g1` | existing | pair-once, route-key-generated, origin-destination-present | g1-nullable-origin (origin-destination-present, CONSTRAINT_MISSING) | — | — |
| `c10-g2` | existing | pair-once | — | ties | nulls |
| `c10-i1` | existing | surrogate-key, key-generated, name-unique | i1-no-unique (name-unique, CONSTRAINT_MISSING) | — | — |
| `c10-i2` | existing | fact-names-customer, weight-optional | — | — | — |
| `c10-i3` | existing | each-name-once, no-name-left-out, null-name-left-out | i3-null-kept (null-name-left-out, NULL_LOADED) | nulltext | — |
| `c10-i4` | existing | keys-match, keys-present, names-once, pairs-once, one-row-per-shipment, weight-may-be-missing, null-route-left-out, null-customer-left-out | i4-dup-names (names-once, DIMENSION_DUPLICATE), i4-dup-pairs (pairs-once, DIMENSION_DUPLICATE), i4-fanout (one-row-per-shipment, JOIN_FANOUT), i4-weight-dropped (weight-may-be-missing, NULL_LOADED), i4-null-route (null-route-left-out, NULL_LOADED), i4-null-customer (null-customer-left-out, NULL_LOADED) | nulltext | — |
| `c10-b1-p3` | existing | arrivals-only, route-ends-there, zero-arrival-kept | p3-inner (zero-arrival-kept, LEFT_TO_INNER) | — | — |
| `c11-g1` | existing | newest-kept, one-row-per-customer, unknown-left-out, second-run-succeeds | g1-no-distinct (one-row-per-customer, DUPLICATE_KEY_IN_BATCH), g1-unknown-kept (unknown-left-out, FACT_MISSING_KEY) | — | — |
| `c11-g2` | existing | new-customer-inserted, known-customer-updated, newest-change-merged | g2-earliest (newest-change-merged, LATEST_VS_EARLIEST) | — | — |
| `c11-g3` | existing | strictly-newer, watermark-advanced, one-copy, skip-no-status, skip-orphans, second-run-adds-nothing | g3-no-distinct (one-copy, DUPLICATE_KEY_IN_BATCH), g3-no-status-filter (skip-no-status, NULL_LOADED), g3-orphans-kept (skip-orphans, FACT_MISSING_KEY), g3-min-watermark (second-run-adds-nothing, WATERMARK_NOT_ADVANCED) | — | — |
| `c11-i1` | existing | counts-every-shipment, second-run-succeeds, second-run-same-counts | i1-cancelled-out (counts-every-shipment, FILTER_MISSING) | — | — |
| `c11-i2` | existing | newest-merged, update-known, insert-new, delete-unreported | i2-earliest (newest-merged, LATEST_VS_EARLIEST), i2-no-update (update-known, MERGE_MATCHED_IGNORED) | — | — |
| `c11-i3` | existing | strictly-newer, one-copy, skip-no-status, skip-orphans, watermark-newest, watermark-advanced | i3-null-kept (skip-no-status, NULL_LOADED), i3-min-watermark (watermark-newest, WATERMARK_NOT_ADVANCED) | — | — |
| `c11-i4` | existing | skip-repeat, one-current-row, keep-old-rows, add-changes, newest-change | i4-earliest (newest-change, LATEST_VS_EARLIEST) | — | — |
| `c11-i5` | existing | missing-shipment-listed, known-not-listed | — | — | — |
| `c11-i6` | existing | once-not-listed, copies-per-id | — | — | — |
| `c11-b1-p1` | existing | copy-once, skip-no-status, skip-missing-shipment, second-run-no-error, second-run-same-rows | b1p1-no-distinct (copy-once, DUPLICATE_KEY_IN_BATCH), b1p1-rerun-overwrites (second-run-same-rows, RERUN_CHANGES_ROWS) | — | — |
| `c11-b1-p2` | existing | newest-per-shipment, tie-larger-id, second-run-no-error, second-run-same-rows | b1p2-earliest (newest-per-shipment, LATEST_VS_EARLIEST), b1p2-rerun-overwrites (second-run-same-rows, RERUN_CHANGES_ROWS) | — | — |
| `c11-b1-p3` | existing | zero-check-shown, missing-status-counted | — | — | — |
| `c12-i2` | existing | two-columns-only, customer-of-shipment | — | — | — |
| `c12-i3` | existing | largest-first, five-rows, primary-key-order | i3-no-limit (five-rows, LIMIT_MISSING) | — | — |
| `c12-i4` | existing | ids-one-to-fifty, begins-with-del | — | — | — |
| `c12-i5` | new | covers-shipment-id, shipment-id-first | i5-wrong-column (covers-shipment-id, INDEX_WRONG_COLUMN), i5-wrong-order (shipment-id-first, INDEX_COLUMN_ORDER) | nulls, boundary | — |
| `c13-g1` | existing | two-heaviest, equal-weights-smaller-id, weight-present, two-per-customer | g1-id-desc (equal-weights-smaller-id, TIE_BREAK_REVERSED), g1-null-kept (weight-present, NULL_AS_DEFAULT) | — | — |
| `c13-i1` | existing | gap-breaks-island, repeat-once | — | — | — |
| `c13-i2` | existing | every-shipment-counts, utc-months, change-current-minus-previous, first-change-missing | i2-cancelled-out (every-shipment-counts, FILTER_MISSING), i2-first-zero (first-change-missing, NULL_AS_DEFAULT) | — | — |
| `c13-i3` | existing | cohort-members-only, customer-once, next-month-retained | i3-same-month (next-month-retained, COHORT_SAME_MONTH) | — | — |
| `c13-i4` | existing | returned-is-zero | — | — | — |
| `c13-b1-p1` | existing | newest-by-time, tie-larger-id | — | — | — |
| `c13-b1-p2` | existing | second-distinct, shared-weight-once, one-distinct-left-out, weight-present | b1p2-no-distinct (shared-weight-once, DISTINCT_MISUSE), b1p2-fallback (one-distinct-left-out, NULL_AS_DEFAULT), b1p2-null-kept (weight-present, NULL_AS_DEFAULT) | nulls | — |
| `c2-g1` | existing | missing-driver | — | — | — |
| `c2-g2` | existing | missing-labelled | — | — | — |
| `c2-g3` | existing | unassigned-count, weighed-count | — | — | — |
| `c2-i1` | existing | missing-region | — | — | — |
| `c2-i2` | existing | no-weight-not-counted, one-decimal | i2-round-zero (one-decimal, CAST_ROUNDING) | — | — |
| `c2-i3` | existing | no-shipments, region-missing | — | — | — |
| `c2-i4` | existing | no-paid-date | — | — | — |
| `c2-b1-p1` | existing | no-supervisor | — | — | — |
| `c2-b1-p2` | existing | paid-when-present, fallback-issued | — | — | — |
| `c3-g1` | existing | one-row-per-customer, count-shipments, no-shipments-absent | g1-customer-placeholder (no-shipments-absent, FILTER_MISSING) | — | — |
| `c3-g2` | existing | largest-weight, average-one-decimal, no-driver-ignored | g2-null-driver (no-driver-ignored, NULL_AS_DEFAULT) | — | — |
| `c3-i1` | existing | each-invoice-once, total-not-average, no-invoice-absent | i1-customers-left (no-invoice-absent, FILTER_MISSING) | — | — |
| `c3-i3` | existing | range-from-start, range-to-end, earliest-and-latest, one-row-per-customer, none-not-listed | i3-start-after (range-from-start, GE_VS_GT), i3-end-inclusive (range-to-end, BETWEEN_END_BOUND), i3-customers-left (none-not-listed, FILTER_MISSING) | nulls | nulltext |
| `c3-b1-p1` | existing | calendar-day, at-least-two, range-half-open, counts-cancelled | b3p1-end-inclusive (range-half-open, BETWEEN_END_BOUND), b3p1-no-cancelled (counts-cancelled, FILTER_MISSING) | boundary, precision | ties |
| `c3-b1-p2` | existing | every-shipment-counted, unbilled-listed, billed-null-when-none, customers-with-shipments | b3p2-zero-billed (billed-null-when-none, NULL_AS_DEFAULT), b3p2-all-customers (customers-with-shipments, FILTER_MISSING) | empty | — |
| `c4-g3` | existing | no-shipments-only | — | — | — |
| `c4-g4` | existing | kept-without-invoice, invoice-of-shipment | — | — | — |
| `c4-i1` | existing | kept-without-driver, driver-of-shipment | — | — | — |
| `c4-i2` | existing | every-driver-listed, supervisor-by-id, null-not-empty | i2-empty-text (null-not-empty, NULL_AS_DEFAULT) | — | — |
| `c4-i5` | existing | no-events-only | — | — | — |
| `c4-i6` | existing | customers-with-shipments, distinct-shipments, include-no-events | i6-all-customers (customers-with-shipments, FILTER_MISSING) | — | — |
| `c4-i7` | existing | delivered-only, route-1-or-2, each-driver-once, driver-of-shipment | i7-no-status (delivered-only, FILTER_MISSING), i7-no-route (route-1-or-2, FILTER_MISSING) | boundary | — |
| `c4-b1-p1` | existing | driver-may-be-missing, origin-city | — | — | — |
| `c4-b1-p2` | existing | no-delivered-shipment, delivered-shipments-only, link-by-customer | b4p2-events (delivered-shipments-only, WRONG_SOURCE) | — | — |
| `c5-g1` | existing | above-average, ids-one-to-twelve, missing-left-out | g1-null-kept (missing-left-out, NULL_AS_DEFAULT) | — | — |
| `c5-g2` | existing | customer-once, link-by-customer | — | — | — |
| `c5-g3` | existing | at-least-500, early-ids-up-to-30 | — | — | — |
| `c5-i1` | existing | no-supervisee, nulls-do-not-hide-drivers | — | — | — |
| `c5-i2` | existing | same-customer, customer-average, missing-not-counted | i2-null-zero (missing-not-counted, NULL_AS_DEFAULT) | — | — |
| `c5-i4` | existing | customer-once, link-invoice-shipment | — | — | — |
| `c5-i5` | existing | above-overall-average, true-average, missing-not-counted | i5-null-zero (missing-not-counted, NULL_AS_DEFAULT) | — | — |
| `c5-b1-p2` | existing | customer-once, link-by-customer, at-least-900 | b5p2-strict (at-least-900, GE_VS_GT) | ties | — |
| `c5-b1-p3` | existing | every-driver-listed, zero-when-none, queued-only, at-least-1800 | b5p3-not-queued (queued-only, FILTER_MISSING), b5p3-strict (at-least-1800, GE_VS_GT) | ties | — |
| `c6-g1` | existing | unweighed-when-missing, light-under-1000 | — | — | — |
| `c6-g2` | existing | first-three-chars, capital-letters | g2-no-upper (capital-letters, LIKE_CASE) | — | — |
| `c6-i1` | existing | unweighed-when-missing, heavy-at-1000 | — | — | — |
| `c6-i2` | existing | prefix-first-two, serial-last-four | — | — | — |
| `c6-i4` | existing | round-nearest, average-of-weights, missing-ignored | i4-null-zero (missing-ignored, NULL_AS_DEFAULT) | — | — |
| `c6-i5` | existing | brackets-always, unassigned-when-missing | — | — | — |
| `c6-b1-p1` | existing | unweighed-band, light-under-1000, heavy-otherwise | b6p1-else-light (heavy-otherwise, CASE_ORDER) | — | — |
| `c6-b1-p2` | existing | prefix-first-two, utc-day | — | — | — |
| `c6-b1-p3` | existing | counts-missing-weight, round-nearest, missing-ignored | b6p3-null-zero (missing-ignored, NULL_AS_DEFAULT) | — | — |
| `c7-g1` | existing | distinct-values, either-feed | — | — | — |
| `c7-i1` | existing | queued-or-invoiced, each-id-once | — | — | — |
| `c7-i2` | existing | delivered-and-invoiced | — | — | — |
| `c7-i4` | existing | missing-from-shipments, each-value-once | i4-except-all (each-value-once, UNION_DEDUPES) | — | — |
| `c7-b1-p1` | existing | both-directions, mismatch-only | — | — | — |
| `c7-b1-p2` | existing | not-in-both, sorted-a-to-z | — | — | — |
| `c8-g1` | existing | oldest-first, numbered-per-customer, tie-by-id | g1-id-desc (tie-by-id, TIE_BREAK_REVERSED) | — | — |
| `c8-g2` | existing | soonest-first, ties-share-rank, next-skips | g2-dense (next-skips, DENSE_VS_RANK) | — | — |
| `c8-g3` | existing | ordered-by-occurred, first-not-returned, differs-only | g3-no-filter (differs-only, FILTER_MISSING) | — | — |
| `c8-i1` | existing | equal-share-rank, next-rank-one-more | — | — | — |
| `c8-i2` | existing | two-due-soonest, exactly-two-rows, lower-id-first | i2-id-desc (lower-id-first, TIE_BREAK_REVERSED) | — | — |
| `c8-i3` | existing | issue-order, total-includes-current | i3-excl-current (total-includes-current, FRAME_OFF_BY_ONE) | — | — |
| `c8-i4` | existing | three-invoices-window, two-decimals | i4-round-zero (two-decimals, CAST_ROUNDING) | — | — |
| `c8-i5` | existing | whole-seconds, last-scan-null, next-is-later, same-moment-greater-id | i5-truncate (whole-seconds, CAST_ROUNDING), i5-same-moment (same-moment-greater-id, TIE_BREAK_REVERSED) | — | — |
| `c8-b1-p1` | existing | most-recent, per-customer, no-shipments-absent, tie-greater-id | b1p1-customers-left (no-shipments-absent, FILTER_MISSING), b1p1-smaller-id (tie-greater-id, TIE_BREAK_REVERSED) | — | — |
| `c9-g1` | existing | id-unique, id-present, name-present | g1-nullable-id (id-present, CONSTRAINT_MISSING) | — | — |
| `c9-g2` | existing | only-shipment-seven, marked-cancelled | g2-delivered (marked-cancelled, WRONG_VALUE) | — | — |
| `c9-g3` | existing | undone, transaction-ends | — | — | — |
| `c9-g4` | existing | above-zero, names-real-shipment | g4-no-fk (names-real-shipment, CONSTRAINT_MISSING) | — | — |
| `c9-i1` | existing | id-unique, id-present, code-present, code-unique, name-present | i1-id-repeats (id-unique, CONSTRAINT_MISSING), i1-nullable-id (id-present, CONSTRAINT_MISSING), i1-nullable-name (name-present, CONSTRAINT_MISSING) | — | — |
| `c9-i2` | existing | carrier-key, carrier-name, carrier-fk, shipment-fk, pair-once | i2-carrier-no-key (carrier-key, CONSTRAINT_MISSING), i2-nullable-name (carrier-name, CONSTRAINT_MISSING), i2-pair-repeats (pair-once, CONSTRAINT_MISSING) | — | — |
| `c9-i3` | existing | cancelled-cleared, others-unchanged | — | — | — |
| `c9-i4` | existing | both-rows-kept, region-null | i4-empty-region (region-null, NULL_AS_DEFAULT) | — | — |
| `c9-b1-p1` | existing | rate-above-zero, lane-once | p1-no-unique (lane-once, CONSTRAINT_MISSING) | — | — |
| `c9-b1-p3` | existing | both-changes-kept, shipment-delivered, note-null | p3-note (note-null, NULL_AS_DEFAULT) | — | — |
| `dispatch` | existing | at-least-500, queued-only, at-most-five, heaviest-first, tie-id-ascending | dispatch-no-status (queued-only, FILTER_MISSING), dispatch-no-limit (at-most-five, LIMIT_MISSING), dispatch-id-desc (tie-id-ascending, TIE_BREAK_REVERSED) | — | — |
| `unbilled` | existing | every-customer, real-shipments-counted, unbilled-means-no-invoice | unbilled-counts-billed (unbilled-means-no-invoice, AGGREGATE_CHOICE) | — | — |
| `latest-event` | existing | one-row-per-shipment, latest-by-time, tie-greatest-id | latest-no-filter (one-row-per-shipment, FACT_GRAIN) | — | — |

