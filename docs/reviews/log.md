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
