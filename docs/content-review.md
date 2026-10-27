# Independent Step 1 content review

## Method and independence

A separate reviewer wrote three solutions from the ticket specifications before
opening the author's reference SQL, hints or lesson text. The reviewer first
executed those solutions against all three fixtures and compared their results
with independently calculated JavaScript expectations. Only after the three blind
tests passed did the reviewer inspect the authored answers and explanations.

The review is preserved in `tests/blind-review.test.ts`. The independent billing
solution uses a correlated NOT EXISTS count, rather than the author's LEFT JOIN
aggregate. The independent latest-event solution uses a derived table around
ROW_NUMBER, rather than the author's CTE.

## Executed checks

Four tests passed:

1. All three blind solutions on the visible sample fixture.
2. All three blind solutions on the hidden NULL/empty-result fixture.
3. All three blind solutions on the hidden tie-breaking fixture.
4. Post-blind comparison with every authored reference, expected output names and
   PostgreSQL type OIDs; detection of each intentionally wrong variant; execution
   of every worked example on every fixture.

The ticket instructions specify output columns, types, inclusion rules, final
ordering and tie-breakers sufficiently to solve them without the reference SQL.
The sample challenges have no unexplained hand-authored output tables: tested
results came from the actual PGlite PostgreSQL engine.

## Explanation and citation review

The reviewer checked the narrow technical claims against official documentation:

- PostgreSQL SELECT and LIMIT ordering behavior.
- COUNT(*) versus COUNT(expression), including NULL handling.
- LEFT JOIN's unmatched rows and NULL right-hand columns.
- Aggregate FILTER syntax.
- Window partitions, ordering and ROW_NUMBER tie behavior.
- The concise T-SQL and Spark/Databricks dialect notes in the chapter metadata.

The source retrieval pass covered 42 distinct canonical URLs. Forty-one returned
HTTP 200. The original Databricks Delta MERGE URL was blocked by the environment
proxy. The official Azure Databricks equivalent on Microsoft Learn was then
retrieved successfully and supports the same claim:

https://learn.microsoft.com/en-us/azure/databricks/delta/merge

HTTP success alone was not treated as correctness evidence; the relevant
PostgreSQL passages about COUNT, LEFT JOIN, FILTER and unspecified ROW_NUMBER tie
ordering were also inspected. Full future chapter lessons do not exist yet and
are outside this review.

## Corrections applied during root integration

1. The latest-event lesson originally said ROW_NUMBER can pick a row per group
   only with a complete tie-breaker. It can pick one without that order, but the
   choice among tied rows is unspecified. The proposed correction distinguishes
   selection from deterministic selection.
2. Replace the blocked Databricks source with the verified official Azure
   Databricks source, or keep its verification explicitly outstanding.

Root integration applied both the deterministic tie-breaker wording and the
verified Microsoft Learn source replacement. The reviewer did not edit authored
content or commit repository changes.
