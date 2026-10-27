# Step 1 content and deterministic-data design

This document describes implemented content data, not the later full chapter lessons.

## Curriculum

`src/data/curriculum.ts` contains 13 typed chapters in prerequisite order 1 → 13.
Every chapter has explicit competency and objective IDs, planned guided/independent/
boss counts, PostgreSQL references, and short T-SQL and Spark/Databricks notes.
The detailed checklist includes NULL/three-valued logic, all requested joins and
anti-joins, correlated subqueries, window frames, constraints, star schemas, SCD2,
quality checks, performance and interview readiness. The full chapters remain
roadmap Steps 2 and 3; this step implements their metadata and three sample tickets.

Tests check unique IDs, existing prerequisites, acyclicity, reachability from the
single root, all 13 competencies and the detailed objective mapping.

## Eight-table schema

- `customers`: customer identity and optional region; two customers have no shipments.
- `warehouses`: invented warehouse names and fictional city labels.
- `routes`: directed origin/destination foreign keys and positive distances.
- `drivers`: invented names and optional self-referencing supervisors.
- `shipments`: customer/route/optional-driver references, status, nullable weight,
  booking timestamp and due date. Tracking codes are unique.
- `shipment_events`: many scans per shipment, nullable notes and deliberately tied
  timestamps. The event ID breaks latest-event ties.
- `invoices`: at most one invoice per shipment, exact decimal amounts, optional
  payment timestamps and repeated legitimate amounts.
- `customer_versions`: surrogate-key customer region history with half-open date
  boundaries represented by valid_from/valid_to; NULL valid_to marks the current row.

DDL enforces primary/foreign keys, required values, relevant UNIQUE constraints,
positive weights/distances, nonnegative invoice amounts and valid history ranges.
No serial sequences or nondeterministic defaults are used.

## Seed contract

`generateSeed(seed, variant)` uses Mulberry32, a fixed UTC base date and stable
creation order. `seedSql` emits unqualified DDL/inserts so the warm engine can
load each fixture into its own schema. No wall-clock time or Math.random is used.
Invoice decimal strings are kept as strings while generating SQL.

| Dataset | Seed | Visibility | Shipments | Purpose |
| --- | --- | --- | --- | --- |
| sample | 104729 | Visible | 240 | Mixed statuses, NULLs, boundary weights, date transitions, missing invoices/events |
| nulls | 130363 | Hidden | 120 | Empty beginner result, many missing driver assignments, sparse invoices |
| ties | 155921 | Hidden | 180 | Six equal qualifying weights, tied latest scans, deterministic tie-breaking |

These are public client-side source fixtures withheld from the normal challenge
UI. They are not cryptographically secret and are not an anti-cheating boundary.

Seed tests check same-seed data/SQL equality, different-seed variation, primary-key
uniqueness, foreign-key integrity, intentional edge cases and actual PostgreSQL
DDL acceptance. A deliberately invalid foreign-key insert must fail.

## Three authored tickets

### The heavy-load shortlist (`dispatch`)

Return the five heaviest queued shipments weighing at least 500 kg, ordered by
weight descending and ID ascending. Columns and types are explicit. The visible
fixture includes 499/500/501 boundaries. One hidden fixture has no qualifying
rows; the other has six equal qualifying weights. The wrong `> 500` variant
fails an edge fixture.

The lesson/example teaches SELECT/FROM/order/limit on a different directory query.
A fill-in-the-blank query and three hint tiers are included.

### The phantom unbilled shipment (`unbilled`)

Repair COUNT(*) after LEFT JOINs to count actual unbilled shipments for every
customer, including zero for customers with no shipments. No-invoice shipments,
customers with no shipments and repeated invoice values are present. The wrong
COUNT(*) variant creates phantom counts and fails the fixtures.

The example independently demonstrates COUNT(*) versus COUNT(s.id). It does not
calculate the requested invoice metric.

### One reliable latest scan (`latest-event`)

Return the latest scan for each shipment that has an event. Break timestamp ties
with greatest event ID and require a parsed window-function structure. Insertion
order is intentionally not chronological. Missing scans and ties appear in the
fixtures. Choosing the smallest event ID on tied timestamps is the wrong variant.

The worked example ranks shipment weights rather than selecting event rows.

## Validation and review status

The author ran 8 focused tests successfully. For each of the three datasets,
all reference queries were executed in real PGlite and compared with independent
JavaScript algorithms over the generated rows. Their output column names and
PostgreSQL type OIDs were checked. Every intentionally wrong query differed from
its reference on at least one fixture. The author also ran strict TypeScript.

The lesson sources for SELECT, LIMIT, aggregate NULL/count behavior, LEFT JOINs,
aggregate FILTER syntax and windows were retrieved from PostgreSQL 18 docs.
Microsoft Learn and Apache Spark sources for the dialect notes were reachable.
The Databricks Delta MERGE URL was blocked by the environment proxy during author
verification; its retrieval remains outstanding unless later review resolves it.

Author validation is not independent blind review. A separate agent must solve
the three tickets without reading reference SQL, then review explanations against
the official sources. The parent task owns that separate review and final audit.
