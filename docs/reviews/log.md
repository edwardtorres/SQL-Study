# Review log

## Chapter 1 source pass

Counts: supported 21, partly 3, unsupported 1, unverified 0, engine 3. Partly or unsupported: c1-s1 (each row becomes one row: partly); c1-s3 (LIKE leading % only matches begins-with: partly; "Add % at the front to match anywhere": unsupported); dialect:T-SQL (PostgreSQL LIMIT half not on the cited page: partly). Engine flags for result-row statements: c1-s1 predict (LIMIT 3), c1-s2 predict (far more rows), c1-s3 predict (each status once).

## Chapter 2 source pass

Counts: supported 23, partly 1, unsupported 0, unverified 0, engine 3. Partly or unsupported: c2-s1 (the claim that a missing value means "not zero, and not empty text" is partly supported: the page supports "not zero" only for aggregates, and nothing cited covers empty text). Citation gap, not a verdict: the NOT IN claim in c2-s3 is supported by functions-subquery.html, but the attached quote pg-in-null is the IN sentence. Engine flags: c2-s1 predict (removes every row), c2-s3 predict (GROUP BY groups NULL drivers; five rows).

## Chapter 3 source pass

Counts: supported 23, partly 1, unsupported 0, unverified 0, engine 0. Partly or unsupported: c3-s1 ("Without GROUP BY, the whole table is one group, so the query returns one row" is partly supported: queries-table-expressions.html adds that HAVING can eliminate that single row).

## Chapter 4 source pass

Counts: supported 25, partly 3, unsupported 1, unverified 0, engine 3. Partly or unsupported: c4-s1 predict ("A LEFT JOIN would keep the customer" is unsupported as written: in the example shipments is the left table, so a RIGHT JOIN or a LEFT JOIN with customers first is needed); c4-s2 ("The outer join is then undone" is partly supported: the page supports moving the test to ON but does not say the join is undone; "The LEFT JOIN then behaves like an inner join" is partly supported); c4-s3 ("An anti-join finds rows with no match" is partly supported: the term is not on the PostgreSQL pages and comes from the Spark reference). Engine flags: c4-s1 predict and c4-s2 stem (sample data: customer 7; customers 7 and 8), c4-s3 predict (a shipment with four events).

## Chapter 5 source pass

Counts: supported 21, partly 4, unsupported 0, unverified 0, engine 4. Partly or unsupported: c5-s1 ("is correlated" is partly supported: the term is not on the cited pages, only the "refers to variables from the surrounding query" sentence; "worked out again for each outer row" goes beyond the page); c5-s3 (the GROUP BY rule for selected columns is stated too broadly; it applies only to a grouped step; the same condition applies to the MISSING_GROUP_COL mistake). Citation gap, not a verdict: the IN "at most once" claim in c5-s2 is supported by the IN definition, but the attached quote pg-exists-semijoin describes EXISTS. Engine flags: c5-s1 stem (subquery runs once per shipment) and CORRELATED_SCOPE ("nearest table" resolution is not on the cited page), c5-s2 stem (customers 7 and 8), c5-s3 predict (no customer reaches 50; every row rejected).

## Chapter 6 source pass

Counts: supported 28, partly 4, unsupported 1, unverified 0, engine 4. Partly or unsupported: c6-s1 (CASE_ORDER: "every row matches the broad test" overstates; partly); c6-s2 ("PostgreSQL string positions start at 1" is partly supported: the page shows it only by the position() example; "ROUND breaks ties away from zero" holds for numeric only, and double precision is platform dependent); c6-s3 (TIMEZONE_ASSUMED: "the day boundary is set by the zone named in the ticket" is unsupported, since PostgreSQL uses the literal's zone or the session TimeZone and never reads the ticket); dialect:T-SQL (the PostgreSQL interval-arithmetic half is outside the cited Microsoft page; partly). Engine flags: c6-s2 (|| with NULL; substring start 0; the "count is the number of customers" row-count statement).

## Resolution (author, after the source pass)

Applied: every unsupported claim was reworded (c1-s3 LIKE, c4-s1 LEFT JOIN direction, c6-s3 TIMEZONE_ASSUMED). Partly-supported claims were narrowed to the cited wording (c1-s1, c1-s3, c2-s1, c3-s1, c4-s2, c4-s3, c5-s1, c5-s3, c5-s3 MISSING_GROUP_COL, c6-s1, c6-s2 positions and ROUND ties). Predict explanations that stated result rows were reworded (c1-s3, c2-s1, c2-s3, c5-s3, c6-s2); the answer counts are still the engine's and still checked by the content test. Citations: c2-s3 now cites the NOT IN quote (pg-not-in-null); c5-s2 cites the EXISTS quote for the "at most once" claim; the FULL JOIN claim in c4-s2 now cites pg-full-both; the TIMEZONE claim in c6-s3 cites pg-timezone-assumed. Verified by scripts/verify-quotes.mjs: 51 of 51.

Open, not changed: the T-SQL dialect notes in chapters 1 and 6 still need the Microsoft Learn page to say what the note claims about PostgreSQL. The "midnight" meaning of a plain date (c1 BETWEEN mistake) has no verbatim quote yet; the datetime page's "midnight ( 00:00 )" wording needs a quote check before it is cited. Runtime claims (|| with NULL, substring start 0, nearest-table scope, GROUP BY NULL grouping) were confirmed by engine runs during authoring, not by quotes.

## Part A resolutions (Step 3a)

- **A1 ambiguous wording.** Sixteen ticket phrases were reworded (the earlier audit said 15; the blind log lists 17, and c6-i5's example had already been fixed, so 16 remained). Each reword keeps the same reference result, verified by the content check and by a fresh blind re-solve of all 21 changed tickets (`docs/reviews/blind/rerun-a/`).
- **A2 date ranges.** `c3-i3` and `c3-b1-p1` now use the half-open range 1 January 2026 (UTC, inclusive) to 1 February 2026 (UTC, exclusive). `c6-b1-p2` states its booked-day span: shipments 1 and 2 on 2026-01-31, shipments 3 through 10 on 2025-12-28. The `c6-b1-p2` reference is unchanged. The chapter 6 dates lesson gains a half-open note, demonstrated by the engine (counts 1 and 2).
- **A3 precision.** A hidden `precision` dataset keeps the 90071992.01 invoices. Every fifth invoice on the visible sample is now a value from 100.00 to 275.00 (the same range as the other invoices), computed without consuming a random number, so the other seed data is unchanged. `c3-i1` and `c3-b1-p2` (the two sum items) include `precision`.
- **A4 visible-sample rule.** Enforced in `tests/content.test.ts`. The only item that broke it was `c5-b1-p3`; its threshold moved from 1500 to 1800 kg, where driver 2 has no heavy queued shipment on the sample. `c5-i3` already meets the rule through `COUNT(DISTINCT driver_id)`, so it keeps threshold 30, as decided.
- **A5 demonstrations.** Labeled "Demonstrated by the engine": `||` with NULL and CONCAT (chapter 6), SUBSTRING from position 0 (chapter 6), GROUP BY grouping NULL driver ids (chapter 2), a plain date meaning midnight (chapter 1), and the half-open range note (chapter 6). The content check runs every demonstration on the visible sample.
- **A6 dialect notes.** Microsoft Learn, TOP page: "When you use TOP with the ORDER BY clause, the result set is limited to the first n number of ordered rows." and "Otherwise, TOP returns the first n number of rows in an undefined order." The chapter 1 note now says only that. Microsoft Learn, DATEADD page: "This function adds a number (a signed bigint) to a datepart of an input date, and returns a modified date/time value." The chapter 6 note now says only that.
- **A7 startup.** Only the sample is seeded at init; hidden datasets load in the background, one at a time, and a Submit awaits them. Median time to a runnable editor (five fresh Chromium loads, 1280 px): 3.89 s, from 4.5 s before.

## Part A follow-up: fresh blind re-solve of the 21 changed tickets

A fresh solver saw only the reworded ticket text, the schema, and the regenerated visible sample. It did not see the references or the earlier solutions. Its SQL agrees with every reference on every dataset that ticket uses (`docs/reviews/blind/rerun-a/compare.json`, 21 of 21). It reported no low-confidence solves; five were medium: c3-i1, c3-b1-p1, c4-i6, c5-b1-p1, c6-b1-p1.

Its alternative readings changed the sample result for four tickets, so those wordings were tightened without changing any reference:
- `c4-b1-p2`: "status is delivered" now says the shipments.status column, not shipment events (an events reading returned 6 customers, not 2).
- `c5-b1-p1`: the average is over every queued shipment in the table; ids 1 through 60 limit only which shipments are listed (the ids-only average returned 7 rows, not 8).
- `c4-i6` and `c3-i3`: "for each customer_id" now lists only customers with at least one shipment (in the range, for c3-i3); customers 7 and 8 have none.
- `c3-b1-p1`: every shipment counts, whatever its status, cancelled ones included.
- `c3-i1`: customers with no invoices are not listed.

The re-solve's other ambiguities (for example "ordered by name from A to Z") were checked against the reference and need no change. The content check passes after these edits.

## Chapters 7 to 9 source pass (Step 3a)

A fresh agent checked every lesson claim, predict explanation, common mistake and dialect note in chapters 7 to 9 against the cited pages. Output: `docs/reviews/source/ch7.json`, `ch8.json`, `ch9.json`.

| Chapter | Supported | Partly | Unsupported | Unverified | Demonstration |
|---|---|---|---|---|---|
| 7 | 18 | 3 | 1 | 0 | 9 |
| 8 | 22 | 3 | 0 | 0 | 5 |
| 9 | 18 | 8 | 1 | 1 | 5 |

Resolutions (applied in the lesson files and curriculum dialect notes):
- c7-s1: UNION appends rows, with no guaranteed row order (quote `pg-union-appends`).
- c7-s2: the EXCEPT mistake now says which feed is kept and where it sits.
- c7-s3: removed the column-name sentence; the demonstration carries that claim. LIMIT and ORDER BY wording now follows `pg-union-parens`.
- c8-s2: FRAME_OFF_BY_ONE says the frame holds up to three rows and fewer near a partition start (`pg-frame-fewer`). LAG_NULL_FIRST cites `pg-three-valued`.
- c8-s3: PARTITION_MISSING cites `pg-no-partition`.
- c8 Spark note: window frame defaults to CURRENT ROW when frame_end is omitted.
- c9-s1: CHECK is a rule for a Boolean expression, not a rule for one column; the contract sentence was reworded.
- c9-s2: DELETE without WHERE removes every row; UPDATE wording follows `pg-update`; the subquery sentence no longer states an execution order.
- c9-s2: the AND/OR mistake no longer makes an uncited precedence claim.
- c9-s3: open-transaction wording follows `pg-incomplete-hidden`; the predict option now says the dry run was discarded, not restored.
- c9 T-SQL and Spark notes narrowed to what the Microsoft and Spark pages state.

The c9-s1 "unverified" item was the contract sentence; it is reworded, not kept.

Verification after these changes: `scripts/verify-quotes.mjs` 87 of 87 verbatim; `tests/content.test.ts` and `tests/data-curriculum.test.ts` 13 of 13 pass.

## Chapters 7 to 9 blind solve (Step 3a)

A fresh agent solved the 24 independent and boss tickets for chapters 7 to 9 from the ticket text, the seed schema and the visible sample only. It did not read the reference SQL, the wrong variants or the grader. For constraint tests it wrote its own probes from the test names and expected outcomes. Output: `docs/reviews/blind/ch789/`, one file per ticket, and `compare.json`.

Result on first comparison: 23 of 24 agreed. Confidence: 19 high, 5 medium, none low.

Defect found and fixed:
- `c7-b1-p1` reference: `A EXCEPT B UNION B EXCEPT A` has no parentheses. PostgreSQL evaluates set operators left to right, so it returned only the invoice-only shipments. The ticket asks for both kinds of mismatch. The reference is now `(A EXCEPT B) UNION (B EXCEPT A)`. The content check had passed the old reference because it only checks that wrong variants differ from it; it cannot detect a reference that is wrong on its own terms. The blind comparison (24 of 24 agree) is the check that caught it.

Ambiguities and resolution:
- `c8-i2`: "return the two shipments due soonest" now says "among all of its shipments", so no status filter is implied.
- `c8-i5`: "whole seconds" now says "rounded to the nearest whole second"; the tie rule now says a scan at the same moment with a greater id is the next scan. The reference is unchanged.
- `c9-i2`: the starter is described as a placeholder for carriers, to be replaced; the key pair wording is clarified.
- `c9-b1-p1`: "two decimal places" is now the type `numeric(8,2)`.

Readings left as written, because the ticket is explicit or every reading gives the same rows on every dataset the ticket uses: `c7-i3` ("Order by id"), `c7-b1-p2` ("Sort from A to Z"), `c8-i4` and `c9-b1-p2` (rounding), `c8-b1-p3` (average; both readings give the same sample rows), `c9-b1-p3` (UTC is stated), `c9-i6` (starter wording), and `c8-b1-p2` (a zero customer total, which no dataset has).

Author questions answered:
- `c9-i4` "keep them": the reference's COMMIT keeps the two rows inside the grader's rolled-back wrapper, so the checks see them. The content check proves it: the ROLLBACK wrong variant leaves a different state on the sample and on the hidden datasets.
- Ticket `kind`: all 24 are labelled `write`. In this codebase `kind` names the starter convention (a bare skeleton for `write`, blanks for `guided`), not whether the statement changes data. Result-graded tickets whose starter is a SELECT keep `write` as they did in Step 2.

After these edits: `tests/content.test.ts` 9 of 9 pass; the blind comparison agrees on 24 of 24.
