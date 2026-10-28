import type { Challenge, CheckQuery, Policy } from '../../core/types';
import { datasetsFor } from '../datasets';

const INSERT = 'https://www.postgresql.org/docs/18/sql-insert.html';
const MERGE = 'https://www.postgresql.org/docs/18/sql-merge.html';
const CREATE_VIEW = 'https://www.postgresql.org/docs/18/sql-createview.html';
const CREATE_TABLE = 'https://www.postgresql.org/docs/18/sql-createtable.html';
const DOCS_UPSERT = [{ label: 'PostgreSQL INSERT and ON CONFLICT', url: INSERT }];
const DOCS_MERGE = [{ label: 'PostgreSQL MERGE', url: MERGE }];
const DOCS_VIEW = [{ label: 'PostgreSQL CREATE VIEW', url: CREATE_VIEW }];
const DOCS_TABLE = [{ label: 'PostgreSQL CREATE TABLE', url: CREATE_TABLE }];
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };
const CUSTOMERS = { colleague: 'Tamsin Rowe', colleagueRole: 'Customer success lead' };
const DISPATCH = { colleague: 'Nera Vale', colleagueRole: 'Dispatch coordinator' };
const REPORTING = { colleague: 'Tarin Wren', colleagueRole: 'Reporting analyst' };

const UPSERT: Policy = { allow: ['CreateStmt', 'InsertStmt'] };
const MERGE_POLICY: Policy = { allow: ['CreateStmt', 'InsertStmt', 'MergeStmt'] };
const LOAD_WATERMARK: Policy = { allow: ['InsertStmt', 'UpdateStmt'] };
const SCD2: Policy = { allow: ['InsertStmt', 'UpdateStmt'] };
const VIEW: Policy = { allow: ['ViewStmt'] };

// The feed's newest region change per known customer. Shared by the SCD2 references and their wrong variants.
const latestChanges = `WITH latest AS (
  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at
  FROM staging_customer_regions
  WHERE customer_id IN (SELECT id FROM customers)
  ORDER BY customer_id, changed_at DESC
)`;
const changesWhere = (filter: string) => `${latestChanges},
changes AS (
  SELECT l.customer_id, l.region, l.changed_at
  FROM latest AS l
  JOIN customer_versions AS cv ON cv.customer_id = l.customer_id AND cv.valid_to IS NULL
  WHERE ${filter}
)`;
// Step one adds each new version beside the old current row, so the change list is read before anything closes.
const openNew = `INSERT INTO customer_versions (id, customer_id, region, valid_from, valid_to)
SELECT (SELECT MAX(id) FROM customer_versions) + ROW_NUMBER() OVER (ORDER BY c.customer_id), c.customer_id, c.region, c.changed_at, NULL
FROM changes AS c;`;
// Step two closes each old current row at the start of the newer version beside it.
const closeOld = `UPDATE customer_versions AS prev
SET valid_to = newer.valid_from
FROM customer_versions AS newer
WHERE newer.customer_id = prev.customer_id
  AND newer.valid_from > prev.valid_from
  AND prev.valid_to IS NULL
  AND newer.valid_to IS NULL;`;

// The watermark load: scans newer than the watermark, one copy each, with a known shipment and a status. The watermark then moves to the newest scan.
const watermarkLoad = (comparison: string, distinct: string, shipmentCheck: string, advance: string) => `INSERT INTO shipment_events (id, shipment_id, status, occurred_at, note)
SELECT ${distinct}s.id, s.shipment_id, s.status, s.occurred_at, NULL
FROM staging_scans AS s
${shipmentCheck}
WHERE s.status IS NOT NULL
  AND s.occurred_at ${comparison} (SELECT last_loaded_at FROM load_watermark WHERE id = 1);${advance}`;
const JOIN_SHIPMENTS = 'JOIN shipments AS sh ON sh.id = s.shipment_id';
const ADVANCE = '\nUPDATE load_watermark SET last_loaded_at = (SELECT MAX(occurred_at) FROM staging_scans) WHERE id = 1;';
const EVENT_CHECK: CheckQuery = { id: 'loaded-events', label: 'Loaded scan events', sql: 'SELECT id, shipment_id, status, occurred_at, note FROM shipment_events WHERE id >= 1000 ORDER BY id' };
const WATERMARK_CHECK: CheckQuery = { id: 'watermark', label: 'Watermark', sql: 'SELECT id, last_loaded_at FROM load_watermark ORDER BY id' };

// Chapter 11: Repair the pipeline. Upserts, MERGE, watermarks, SCD2, data-quality reads and views, graded by the state they leave.
export const chapter11Items: readonly Challenge[] = [
  {
    id: 'c11-g1', chapterId: 11, role: 'guided', starterStyle: 'blanks', title: 'Keep each customer’s newest region',
    ...CUSTOMERS,
    summary: 'Load the newest region change for each known customer, and load it again safely.',
    instructions: 'The feed can send several region changes for one customer. customer_region_current keeps one row per customer: the newest change. Changes for a customer id that is not in customers are left out. The table must not fail when the load runs a second time. The blank is the direction that puts the newest change first.',
    starterSql: 'CREATE TABLE customer_region_current (\n  customer_id integer PRIMARY KEY REFERENCES customers (id),\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO customer_region_current (customer_id, region, changed_at)\nSELECT DISTINCT ON (customer_id) customer_id, region, changed_at\nFROM staging_customer_regions\nWHERE customer_id IN (SELECT id FROM customers)\nORDER BY customer_id, changed_at ____\nON CONFLICT (customer_id) DO UPDATE SET region = EXCLUDED.region, changed_at = EXCLUDED.changed_at;',
    referenceSql: 'CREATE TABLE customer_region_current (\n  customer_id integer PRIMARY KEY REFERENCES customers (id),\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO customer_region_current (customer_id, region, changed_at)\nSELECT DISTINCT ON (customer_id) customer_id, region, changed_at\nFROM staging_customer_regions\nWHERE customer_id IN (SELECT id FROM customers)\nORDER BY customer_id, changed_at DESC\nON CONFLICT (customer_id) DO UPDATE SET region = EXCLUDED.region, changed_at = EXCLUDED.changed_at;',
    policy: UPSERT,
    checks: [{ id: 'current-regions', label: 'Current region per customer', sql: 'SELECT customer_id, region, changed_at FROM customer_region_current ORDER BY customer_id' }],
    runs: 2,
    columns: [],
    wrongVariants: [
      { id: 'g1-earliest', mistake: 'LATEST_VS_EARLIEST', sql: 'CREATE TABLE customer_region_current (\n  customer_id integer PRIMARY KEY REFERENCES customers (id),\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO customer_region_current (customer_id, region, changed_at)\nSELECT DISTINCT ON (customer_id) customer_id, region, changed_at\nFROM staging_customer_regions\nWHERE customer_id IN (SELECT id FROM customers)\nORDER BY customer_id, changed_at ASC\nON CONFLICT (customer_id) DO UPDATE SET region = EXCLUDED.region, changed_at = EXCLUDED.changed_at;', explanation: 'It looks like the earliest change was kept, not the newest. Customer 2 moved from East to South later in the feed, so the table keeps East. The ticket asks for the newest change, so the order must put the latest first.' },
      { id: 'g1-no-conflict', mistake: 'UPSERT_DUPLICATE_ON_RERUN', sql: 'CREATE TABLE customer_region_current (\n  customer_id integer PRIMARY KEY REFERENCES customers (id),\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO customer_region_current (customer_id, region, changed_at)\nSELECT DISTINCT ON (customer_id) customer_id, region, changed_at\nFROM staging_customer_regions\nWHERE customer_id IN (SELECT id FROM customers)\nORDER BY customer_id, changed_at DESC;', explanation: 'It looks like the ON CONFLICT clause was left out. The first run works, but the second run inserts the same customer ids again and the primary key rejects them. An upsert updates the row that already exists.' },
    ],
    ordered: true,
    hints: [
      'A customer can have several changes, and the table keeps one. Which change should win?',
      'Sort by changed_at DESC within each customer, so DISTINCT ON keeps the newest row for that customer.',
      'The blank is DESC. Keep the ON CONFLICT line so a second run updates instead of failing.',
    ],
    docs: DOCS_UPSERT,
    datasets: datasetsFor(['nulls', 'nulltext']),
  },
  {
    id: 'c11-g2', chapterId: 11, role: 'guided', starterStyle: 'blanks', title: 'Merge the feed into a snapshot',
    ...PIPELINE,
    summary: 'Update the customers already in the snapshot, and add the ones that are not.',
    instructions: 'region_snapshot starts with one row, customer 4 in Central. Merge the newest feed change for each known customer into it: a customer already in the snapshot is updated, and a customer that is not is inserted. The blank is the clause that handles a customer the snapshot does not have yet.',
    starterSql: "CREATE TABLE region_snapshot (\n  customer_id integer PRIMARY KEY,\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO region_snapshot (customer_id, region, changed_at)\nVALUES (4, 'Central', timestamptz '2025-12-28 00:00:00+00');\nMERGE INTO region_snapshot AS t\nUSING (\n  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at\n  FROM staging_customer_regions\n  WHERE customer_id IN (SELECT id FROM customers)\n  ORDER BY customer_id, changed_at DESC\n) AS s\nON t.customer_id = s.customer_id\nWHEN MATCHED THEN UPDATE SET region = s.region, changed_at = s.changed_at\nWHEN ____ THEN INSERT (customer_id, region, changed_at) VALUES (s.customer_id, s.region, s.changed_at);",
    referenceSql: "CREATE TABLE region_snapshot (\n  customer_id integer PRIMARY KEY,\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO region_snapshot (customer_id, region, changed_at)\nVALUES (4, 'Central', timestamptz '2025-12-28 00:00:00+00');\nMERGE INTO region_snapshot AS t\nUSING (\n  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at\n  FROM staging_customer_regions\n  WHERE customer_id IN (SELECT id FROM customers)\n  ORDER BY customer_id, changed_at DESC\n) AS s\nON t.customer_id = s.customer_id\nWHEN MATCHED THEN UPDATE SET region = s.region, changed_at = s.changed_at\nWHEN NOT MATCHED THEN INSERT (customer_id, region, changed_at) VALUES (s.customer_id, s.region, s.changed_at);",
    policy: MERGE_POLICY,
    checks: [{ id: 'snapshot-rows', label: 'Snapshot rows', sql: 'SELECT customer_id, region, changed_at FROM region_snapshot ORDER BY customer_id' }],
    columns: [],
    wrongVariants: [
      { id: 'g2-no-insert', mistake: 'MERGE_NOT_MATCHED', sql: "CREATE TABLE region_snapshot (\n  customer_id integer PRIMARY KEY,\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO region_snapshot (customer_id, region, changed_at)\nVALUES (4, 'Central', timestamptz '2025-12-28 00:00:00+00');\nMERGE INTO region_snapshot AS t\nUSING (\n  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at\n  FROM staging_customer_regions\n  WHERE customer_id IN (SELECT id FROM customers)\n  ORDER BY customer_id, changed_at DESC\n) AS s\nON t.customer_id = s.customer_id\nWHEN MATCHED THEN UPDATE SET region = s.region, changed_at = s.changed_at;", explanation: 'It looks like the not-matched branch was left out. Customers 2 and 6 are in the feed but not in the snapshot yet, so they are never added.' },
      { id: 'g2-no-update', mistake: 'MERGE_MATCHED_IGNORED', sql: "CREATE TABLE region_snapshot (\n  customer_id integer PRIMARY KEY,\n  region text,\n  changed_at timestamptz NOT NULL\n);\nINSERT INTO region_snapshot (customer_id, region, changed_at)\nVALUES (4, 'Central', timestamptz '2025-12-28 00:00:00+00');\nMERGE INTO region_snapshot AS t\nUSING (\n  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at\n  FROM staging_customer_regions\n  WHERE customer_id IN (SELECT id FROM customers)\n  ORDER BY customer_id, changed_at DESC\n) AS s\nON t.customer_id = s.customer_id\nWHEN NOT MATCHED THEN INSERT (customer_id, region, changed_at) VALUES (s.customer_id, s.region, s.changed_at);", explanation: 'It looks like the matched branch was left out. Customer 4 is already in the snapshot as Central, and the feed says West, so the old row stays.' },
    ],
    ordered: true,
    hints: [
      'A merge has one branch for rows that match and one for rows that do not. Which branch adds a customer the snapshot does not have?',
      'WHEN NOT MATCHED THEN INSERT adds the feed rows that the snapshot lacks.',
      'The blank is NOT MATCHED. The matched branch already updates customer 4.',
    ],
    docs: DOCS_MERGE,
    datasets: datasetsFor(['nulls', 'nulltext']),
  },
  {
    id: 'c11-g3', chapterId: 11, role: 'guided', starterStyle: 'blanks', title: 'Load only the newer scans, then move the watermark',
    ...REPORTING,
    summary: 'Load scans newer than the watermark, and move the watermark to the newest scan so the next run starts there.',
    instructions: 'The watermark is the newest scan time that earlier loads took. Load only scans strictly newer than it, one copy of each, skipping scans with no status and scans whose shipment does not exist. Then move the watermark to the newest scan in staging_scans. A second run must add nothing and must not fail. The blank is the comparison that makes the load take only newer scans.',
    starterSql: watermarkLoad('____', 'DISTINCT ', JOIN_SHIPMENTS, ADVANCE),
    referenceSql: watermarkLoad('>', 'DISTINCT ', JOIN_SHIPMENTS, ADVANCE),
    policy: LOAD_WATERMARK,
    checks: [EVENT_CHECK, WATERMARK_CHECK],
    runs: 2,
    columns: [],
    wrongVariants: [
      { id: 'g3-boundary', mistake: 'WATERMARK_BOUNDARY', sql: watermarkLoad('>=', 'DISTINCT ', JOIN_SHIPMENTS, ADVANCE), explanation: 'It looks like >= was used. The scan at exactly the watermark time was already loaded by the earlier run, so it is loaded a second time. The watermark is the last time loaded, so only later scans are new.' },
      { id: 'g3-not-advanced', mistake: 'WATERMARK_NOT_ADVANCED', sql: watermarkLoad('>', 'DISTINCT ', JOIN_SHIPMENTS, ''), explanation: 'It looks like the watermark was never moved forward. The next run starts from the old time, loads the same scans again, and the primary key rejects them.' },
    ],
    ordered: true,
    hints: [
      'The load must take only scans that are newer than the watermark. Which comparison leaves out a scan at exactly the watermark time?',
      'Use strictly greater than, so a scan equal to the watermark is not loaded again.',
      'The blank is >. The UPDATE after the load moves the watermark to the newest scan.',
    ],
    docs: DOCS_UPSERT,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c11-i1', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'Booking counts that a second run does not double',
    ...CUSTOMERS,
    summary: 'Keep one booking count per customer, and make the load safe to run twice.',
    instructions: 'Create customer_bookings with customer_id (integer, the primary key, a customer that exists) and bookings (integer, present). Load one row for each customer with shipments, holding that customer’s number of shipments, counting every shipment whatever its status. The load runs twice in the check: the second run must leave the same counts and must not fail. Write the table and the load.',
    starterSql: 'CREATE TABLE customer_bookings ();\n',
    referenceSql: 'CREATE TABLE customer_bookings (customer_id integer PRIMARY KEY REFERENCES customers (id), bookings integer NOT NULL);\nINSERT INTO customer_bookings (customer_id, bookings)\nSELECT customer_id, COUNT(*)::integer FROM shipments GROUP BY customer_id\nON CONFLICT (customer_id) DO UPDATE SET bookings = EXCLUDED.bookings;',
    policy: UPSERT,
    checks: [{ id: 'bookings', label: 'Bookings per customer', sql: 'SELECT customer_id, bookings FROM customer_bookings ORDER BY customer_id' }],
    runs: 2,
    columns: [],
    wrongVariants: [
      { id: 'i1-adds', mistake: 'UPSERT_ADDS_ON_RERUN', sql: 'CREATE TABLE customer_bookings (customer_id integer PRIMARY KEY REFERENCES customers (id), bookings integer NOT NULL);\nINSERT INTO customer_bookings (customer_id, bookings)\nSELECT customer_id, COUNT(*)::integer FROM shipments GROUP BY customer_id\nON CONFLICT (customer_id) DO UPDATE SET bookings = customer_bookings.bookings + EXCLUDED.bookings;', explanation: 'It looks like the count was added to the old value. The second run then doubles every count, but a load should set the count to the number of shipments, so running it again changes nothing.' },
      { id: 'i1-plain', mistake: 'UPSERT_DUPLICATE_ON_RERUN', sql: 'CREATE TABLE customer_bookings (customer_id integer PRIMARY KEY REFERENCES customers (id), bookings integer NOT NULL);\nINSERT INTO customer_bookings (customer_id, bookings)\nSELECT customer_id, COUNT(*)::integer FROM shipments GROUP BY customer_id;', explanation: 'It looks like the load has no ON CONFLICT clause. The first run works, but the second run inserts the same customer ids and the primary key rejects them.' },
    ],
    ordered: true,
    hints: [
      'A load that runs twice must end in the same state. Which clause updates a row that already exists instead of inserting it again?',
      'Use INSERT ... SELECT ... GROUP BY, then ON CONFLICT (customer_id) DO UPDATE SET bookings = EXCLUDED.bookings.',
      'Reference: CREATE TABLE customer_bookings (...), then the grouped insert with ON CONFLICT.',
    ],
    docs: DOCS_UPSERT,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c11-i2', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'A region board that follows the feed',
    ...PIPELINE,
    summary: 'Merge the newest feed change into a board: update, add, and drop the customers the feed no longer reports.',
    instructions: 'Create region_board with customer_id (integer, the primary key), region (text) and changed_at (timestamptz, present). Before the merge, the board holds customer 1 in North and customer 4 in Central, both changed at 2025-12-28 00:00 UTC. Merge the newest feed change for each known customer into region_board: update a customer already on the board, add one that is not, and delete a board row whose customer the feed does not report. Write the table, the two starting rows and the merge.',
    starterSql: 'CREATE TABLE region_board ();\n',
    referenceSql: "CREATE TABLE region_board (customer_id integer PRIMARY KEY, region text, changed_at timestamptz NOT NULL);\nINSERT INTO region_board (customer_id, region, changed_at) VALUES (1, 'North', timestamptz '2025-12-28 00:00:00+00'), (4, 'Central', timestamptz '2025-12-28 00:00:00+00');\nMERGE INTO region_board AS t\nUSING (\n  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at\n  FROM staging_customer_regions\n  WHERE customer_id IN (SELECT id FROM customers)\n  ORDER BY customer_id, changed_at DESC\n) AS s\nON t.customer_id = s.customer_id\nWHEN MATCHED THEN UPDATE SET region = s.region, changed_at = s.changed_at\nWHEN NOT MATCHED THEN INSERT (customer_id, region, changed_at) VALUES (s.customer_id, s.region, s.changed_at)\nWHEN NOT MATCHED BY SOURCE THEN DELETE;",
    policy: MERGE_POLICY,
    checks: [{ id: 'board-rows', label: 'Board rows', sql: 'SELECT customer_id, region, changed_at FROM region_board ORDER BY customer_id' }],
    columns: [],
    wrongVariants: [
      { id: 'i2-no-delete', mistake: 'MERGE_NO_DELETE', sql: "CREATE TABLE region_board (customer_id integer PRIMARY KEY, region text, changed_at timestamptz NOT NULL);\nINSERT INTO region_board (customer_id, region, changed_at) VALUES (1, 'North', timestamptz '2025-12-28 00:00:00+00'), (4, 'Central', timestamptz '2025-12-28 00:00:00+00');\nMERGE INTO region_board AS t\nUSING (\n  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at\n  FROM staging_customer_regions\n  WHERE customer_id IN (SELECT id FROM customers)\n  ORDER BY customer_id, changed_at DESC\n) AS s\nON t.customer_id = s.customer_id\nWHEN MATCHED THEN UPDATE SET region = s.region, changed_at = s.changed_at\nWHEN NOT MATCHED THEN INSERT (customer_id, region, changed_at) VALUES (s.customer_id, s.region, s.changed_at);", explanation: 'It looks like the delete branch was left out. Customer 1 is no longer reported by the feed, so its row should leave the board, and here it stays.' },
      { id: 'i2-no-insert', mistake: 'MERGE_NOT_MATCHED', sql: "CREATE TABLE region_board (customer_id integer PRIMARY KEY, region text, changed_at timestamptz NOT NULL);\nINSERT INTO region_board (customer_id, region, changed_at) VALUES (1, 'North', timestamptz '2025-12-28 00:00:00+00'), (4, 'Central', timestamptz '2025-12-28 00:00:00+00');\nMERGE INTO region_board AS t\nUSING (\n  SELECT DISTINCT ON (customer_id) customer_id, region, changed_at\n  FROM staging_customer_regions\n  WHERE customer_id IN (SELECT id FROM customers)\n  ORDER BY customer_id, changed_at DESC\n) AS s\nON t.customer_id = s.customer_id\nWHEN MATCHED THEN UPDATE SET region = s.region, changed_at = s.changed_at\nWHEN NOT MATCHED BY SOURCE THEN DELETE;", explanation: 'It looks like the insert branch was left out. Customers 2 and 6 are reported by the feed but not on the board, so they are never added.' },
    ],
    ordered: true,
    hints: [
      'A merge handles three cases: rows in both, rows only in the feed, and rows only on the board.',
      'The three branches are WHEN MATCHED, WHEN NOT MATCHED (add) and WHEN NOT MATCHED BY SOURCE (delete).',
      'Reference: the starting rows, then MERGE with the matched update, the not-matched insert and the by-source delete.',
    ],
    docs: DOCS_MERGE,
    datasets: datasetsFor(['nulls', 'nulltext']),
  },
  {
    id: 'c11-i3', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'Load newer scans once, then move the watermark',
    ...REPORTING,
    summary: 'Load scans newer than the watermark, one copy each, skipping bad rows, then advance the watermark.',
    instructions: 'Load each scan in staging_scans that is strictly newer than load_watermark into shipment_events, using the scan id, shipment, status and time. Keep one copy of a scan the feed sent twice. Skip scans with no status and scans whose shipment does not exist. Then set the watermark to the newest occurred_at of any row in staging_scans. A second run must add nothing and must not fail. Write the load and the watermark update.',
    starterSql: 'UPDATE load_watermark SET last_loaded_at = last_loaded_at;\n',
    referenceSql: watermarkLoad('>', 'DISTINCT ', JOIN_SHIPMENTS, ADVANCE),
    policy: LOAD_WATERMARK,
    checks: [EVENT_CHECK, WATERMARK_CHECK],
    runs: 2,
    columns: [],
    wrongVariants: [
      { id: 'i3-boundary', mistake: 'WATERMARK_BOUNDARY', sql: watermarkLoad('>=', 'DISTINCT ', JOIN_SHIPMENTS, ADVANCE), explanation: 'It looks like >= was used. The scan at exactly the watermark time was already loaded, so it is loaded a second time. Only scans strictly newer than the watermark are new.' },
      { id: 'i3-no-distinct', mistake: 'DUPLICATE_KEY_IN_BATCH', sql: watermarkLoad('>', '', JOIN_SHIPMENTS, ADVANCE), explanation: 'It looks like DISTINCT was left out. The feed sent scan 1007 twice, both copies go into one statement, and the primary key rejects the batch.' },
      { id: 'i3-not-advanced', mistake: 'WATERMARK_NOT_ADVANCED', sql: watermarkLoad('>', 'DISTINCT ', JOIN_SHIPMENTS, ''), explanation: 'It looks like the watermark was never moved. The next run starts from the old time and tries to load the same scans again.' },
      { id: 'i3-no-shipment', mistake: 'FACT_MISSING_KEY', sql: watermarkLoad('>', 'DISTINCT ', '', ADVANCE), explanation: 'It looks like the shipment check was left out. A scan for a shipment that does not exist is then loaded, and the foreign key rejects the batch.' },
    ],
    ordered: true,
    hints: [
      'Each scan must be newer than the watermark, and copies and bad rows must be left out. Which three checks does the load need?',
      'Use a strictly greater comparison, DISTINCT for the repeated scan, a join to shipments, and a status test. Then update the watermark.',
      'Reference: INSERT ... SELECT DISTINCT ... FROM staging_scans JOIN shipments ... WHERE status IS NOT NULL AND occurred_at > the watermark; then UPDATE load_watermark.',
    ],
    docs: DOCS_UPSERT,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c11-i4', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'Open the new region version, then close the old one',
    ...CUSTOMERS,
    summary: 'Apply the newest region change for each known customer to the history, keeping old versions and one current version per customer.',
    instructions: 'customer_versions keeps each customer’s region history: a row holds a region from valid_from until valid_to, and a current row has no valid_to. For each known customer, take the newest feed change. Skip it when it repeats the customer’s current region. Otherwise add a new current row with valid_from set to the change time and the new region. Then close the previous current row by setting its valid_to to the valid_from of the row that replaced it. Keep every old row. Each customer ends with exactly one current row. Write both statements, in that order. New ids continue after the largest id, in customer_id order.',
    starterSql: 'UPDATE customer_versions SET region = region;\n',
    referenceSql: `${changesWhere('cv.region IS DISTINCT FROM l.region')}\n${openNew}\n${closeOld}`,
    policy: SCD2,
    checks: [
      { id: 'versions', label: 'Customer versions', sql: 'SELECT customer_id, region, valid_from, valid_to FROM customer_versions ORDER BY customer_id, valid_from' },
      { id: 'current', label: 'Current versions per customer', sql: 'SELECT customer_id, COUNT(*)::integer AS current_versions FROM customer_versions WHERE valid_to IS NULL GROUP BY customer_id ORDER BY customer_id' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i4-no-close', mistake: 'SCD2_MULTIPLE_CURRENT', sql: `${changesWhere('cv.region IS DISTINCT FROM l.region')}\n${openNew}`, explanation: 'It looks like the old version was never closed. The new version is added beside the current one, so the customer has two current rows and the history cannot say which region applies now.' },
      { id: 'i4-overwrite', mistake: 'SCD2_OVERWRITE', sql: `${latestChanges}\nUPDATE customer_versions AS cv SET region = l.region FROM latest AS l WHERE cv.customer_id = l.customer_id AND cv.valid_to IS NULL AND cv.region IS DISTINCT FROM l.region;`, explanation: 'It looks like the current row was overwritten with the new region. The old region is lost, so the history no longer shows when the change happened. The ticket keeps every old row.' },
      { id: 'i4-noop', mistake: 'SCD2_NOOP_VERSION', sql: `${changesWhere('TRUE')}\n${openNew}\n${closeOld}`, explanation: 'It looks like the repeat check was left out. Customer 2’s feed change repeats South, which is already current, so a new version with the same region is added and the history gains a row that changes nothing.' },
      { id: 'i4-null-equals', mistake: 'NULL_EQUALS', sql: `${changesWhere('cv.region <> l.region')}\n${openNew}\n${closeOld}`, explanation: 'It looks like <> was used to compare regions. Customer 4 has no region now, and a comparison with NULL is unknown, so the change is skipped and the customer never moves to West.' },
    ],
    ordered: true,
    hints: [
      'Each change adds a row and ends an old one. Which step needs the other step’s result?',
      'Skip repeats with IS DISTINCT FROM, since NULL does not equal a value. Insert the new rows first, so the close step can read the start time of the row that replaces the old one.',
      'Reference: WITH latest and changes, then INSERT the new versions, then UPDATE each previous row so valid_to is the newer row’s valid_from.',
    ],
    docs: DOCS_TABLE,
    datasets: datasetsFor(['nulls', 'nulltext']),
  },
  {
    id: 'c11-i5', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'Find scans with no shipment',
    ...PIPELINE,
    summary: 'List each staging scan whose shipment does not exist in shipments.',
    instructions: 'Read staging_scans and list each scan that names a shipment missing from shipments. Show the scan id and the shipment id, ordered by scan id. A scan with a known shipment is not listed. A scan with no shipment id at all counts as having no shipment, so it is listed.',
    starterSql: 'SELECT id, shipment_id\nFROM staging_scans;\n',
    referenceSql: 'SELECT s.id, s.shipment_id\nFROM staging_scans AS s\nLEFT JOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE sh.id IS NULL\nORDER BY s.id;',
    columns: [{ name: 'id', type: 23 }, { name: 'shipment_id', type: 23 }],
    wrongVariants: [
      { id: 'i5-inner', mistake: 'LEFT_TO_INNER', sql: 'SELECT s.id, s.shipment_id\nFROM staging_scans AS s\nJOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE sh.id IS NULL\nORDER BY s.id;', explanation: 'It looks like an inner join was used. An inner join keeps only the scans that match a shipment, so a scan with no shipment can never appear, and the list is always empty.' },
      { id: 'i5-own-id', mistake: 'JOIN_KEY', sql: 'SELECT s.id, s.shipment_id\nFROM staging_scans AS s\nLEFT JOIN shipments AS sh ON sh.id = s.id\nWHERE sh.id IS NULL\nORDER BY s.id;', explanation: 'It looks like the scan’s own id was matched to shipments.id. The shipment is named by shipment_id, so every scan looks orphaned, and the list is wrong.' },
    ],
    ordered: true,
    hints: [
      'Each scan must be matched to a shipment, and the ones that match nothing are the answer. Which join keeps the scans that have no match?',
      'Use LEFT JOIN from staging_scans to shipments, then keep the rows where the shipment id is missing.',
      'Reference: LEFT JOIN shipments ON sh.id = s.shipment_id WHERE sh.id IS NULL, ordered by s.id.',
    ],
    docs: [{ label: 'PostgreSQL joins', url: 'https://www.postgresql.org/docs/18/tutorial-join.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c11-i6', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'Scan ids the feed sent more than once',
    ...DISPATCH,
    summary: 'List each scan id that appears more than once in staging_scans, with how many copies there are.',
    instructions: 'Find every scan id in staging_scans that appears on more than one row. Show the id and the number of rows with that id, ordered by id. An id that appears once is not listed.',
    starterSql: 'SELECT id, status\nFROM staging_scans;\n',
    referenceSql: 'SELECT id, COUNT(*)::integer AS copies\nFROM staging_scans\nGROUP BY id\nHAVING COUNT(*) > 1\nORDER BY id;',
    columns: [{ name: 'id', type: 23 }, { name: 'copies', type: 23 }],
    wrongVariants: [
      { id: 'i6-threshold', mistake: 'DUPLICATE_DETECTION', sql: 'SELECT id, COUNT(*)::integer AS copies\nFROM staging_scans\nGROUP BY id\nHAVING COUNT(*) > 0\nORDER BY id;', explanation: 'It looks like the HAVING test was > 0. Every id has at least one row, so every id is listed. A duplicate is an id with more than one row, so the test must be > 1.' },
      { id: 'i6-shipment-key', mistake: 'DUPLICATE_DETECTION', sql: 'SELECT shipment_id AS id, COUNT(*)::integer AS copies\nFROM staging_scans\nGROUP BY shipment_id\nHAVING COUNT(*) > 1\nORDER BY shipment_id;', explanation: 'It looks like the rows were grouped by shipment. A shipment with several scans is not a duplicate, so the list has the wrong rows. A duplicate scan is one scan id on more than one row.' },
    ],
    ordered: true,
    hints: [
      'A duplicate is one scan id on more than one row. Which column do you group by, and what count is a duplicate?',
      'GROUP BY id, then keep only the groups with more than one row.',
      'Reference: SELECT id, COUNT(*) ... GROUP BY id HAVING COUNT(*) > 1 ORDER BY id.',
    ],
    docs: [{ label: 'PostgreSQL HAVING', url: 'https://www.postgresql.org/docs/18/tutorial-agg.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c11-i7', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'A view of the open shipments',
    ...CUSTOMERS,
    summary: 'Create a view, not a table, that shows the shipments still open.',
    instructions: 'Create a view named open_shipments. It shows id, tracking_code and status for each shipment that is queued or in transit, and nothing else. Being a view, it reflects the shipments table as it is when queried, not a copy. Write the view definition only.',
    starterSql: 'CREATE VIEW open_shipments AS\nSELECT id, tracking_code, status\nFROM shipments;\n',
    referenceSql: "CREATE VIEW open_shipments AS\nSELECT id, tracking_code, status\nFROM shipments\nWHERE status IN ('queued', 'in_transit');",
    policy: VIEW,
    checks: [
      { id: 'view-rows', label: 'Rows through open_shipments', sql: 'SELECT id, tracking_code, status FROM open_shipments ORDER BY id' },
      { id: 'view-kind', label: 'Kind of open_shipments', sql: "SELECT table_type FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'open_shipments'" },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i7-cancelled', mistake: 'VIEW_FILTER_WRONG', sql: "CREATE VIEW open_shipments AS\nSELECT id, tracking_code, status\nFROM shipments\nWHERE status <> 'delivered';", explanation: 'It looks like the filter excludes only delivered shipments. Cancelled shipments are then listed as open, but the ticket asks for queued and in-transit shipments only.' },
      { id: 'i7-queued-only', mistake: 'VIEW_FILTER_WRONG', sql: "CREATE VIEW open_shipments AS\nSELECT id, tracking_code, status\nFROM shipments\nWHERE status = 'queued';", explanation: 'It looks like only queued shipments were kept. In-transit shipments are open too, and the ticket asks for both.' },
    ],
    ordered: true,
    hints: [
      'A view is a stored query. Which statuses count as open?',
      'Filter with WHERE status IN and list the two open statuses.',
      'Reference: CREATE VIEW open_shipments AS SELECT id, tracking_code, status FROM shipments WHERE status IN (...).',
    ],
    docs: DOCS_VIEW,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c11-b1-p1', chapterId: 11, role: 'boss', bossGroup: 'c11-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 1: an archive that a second run leaves alone',
    ...PIPELINE,
    summary: 'Copy each usable scan into an archive once, and let a second run pass without changes.',
    instructions: 'Create scan_archive with id (integer, primary key), shipment_id (integer, must name a shipment), status (text, present) and occurred_at (timestamptz, present). Copy each scan in staging_scans once, skipping scans with no status and scans whose shipment does not exist. A second run must leave the same rows and must not fail. Write the table and the load.',
    starterSql: 'CREATE TABLE scan_archive ();\n',
    referenceSql: 'CREATE TABLE scan_archive (id integer PRIMARY KEY, shipment_id integer NOT NULL REFERENCES shipments (id), status text NOT NULL, occurred_at timestamptz NOT NULL);\nINSERT INTO scan_archive (id, shipment_id, status, occurred_at)\nSELECT DISTINCT s.id, s.shipment_id, s.status, s.occurred_at\nFROM staging_scans AS s\nJOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE s.status IS NOT NULL\nON CONFLICT (id) DO NOTHING;',
    policy: UPSERT,
    checks: [{ id: 'archive-rows', label: 'Archived scans', sql: 'SELECT id, shipment_id, status, occurred_at FROM scan_archive ORDER BY id' }],
    runs: 2,
    columns: [],
    wrongVariants: [
      { id: 'b1p1-plain', mistake: 'UPSERT_DUPLICATE_ON_RERUN', sql: 'CREATE TABLE scan_archive (id integer PRIMARY KEY, shipment_id integer NOT NULL REFERENCES shipments (id), status text NOT NULL, occurred_at timestamptz NOT NULL);\nINSERT INTO scan_archive (id, shipment_id, status, occurred_at)\nSELECT DISTINCT s.id, s.shipment_id, s.status, s.occurred_at\nFROM staging_scans AS s\nJOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE s.status IS NOT NULL;', explanation: 'It looks like the load has no ON CONFLICT clause. The first run works, but the second run inserts the same scan ids and the primary key rejects them.' },
      { id: 'b1p1-no-status', mistake: 'NULL_LOADED', sql: 'CREATE TABLE scan_archive (id integer PRIMARY KEY, shipment_id integer NOT NULL REFERENCES shipments (id), status text NOT NULL, occurred_at timestamptz NOT NULL);\nINSERT INTO scan_archive (id, shipment_id, status, occurred_at)\nSELECT DISTINCT s.id, s.shipment_id, s.status, s.occurred_at\nFROM staging_scans AS s\nJOIN shipments AS sh ON sh.id = s.shipment_id\nON CONFLICT (id) DO NOTHING;', explanation: 'It looks like scans with no status were not left out. The status column does not accept a missing value, so the load fails on the first such scan.' },
      { id: 'b1p1-no-shipment', mistake: 'FACT_MISSING_KEY', sql: 'CREATE TABLE scan_archive (id integer PRIMARY KEY, shipment_id integer NOT NULL REFERENCES shipments (id), status text NOT NULL, occurred_at timestamptz NOT NULL);\nINSERT INTO scan_archive (id, shipment_id, status, occurred_at)\nSELECT DISTINCT s.id, s.shipment_id, s.status, s.occurred_at\nFROM staging_scans AS s\nWHERE s.status IS NOT NULL\nON CONFLICT (id) DO NOTHING;', explanation: 'It looks like the shipment join was left out. A scan for a missing shipment is then loaded, and the foreign key rejects the load.' },
    ],
    ordered: true,
    hints: [
      'Two things must hold: each scan once, and a second run with no error. Which clause makes a repeated scan do nothing?',
      'Keep DISTINCT and the shipment join and the status filter, and add ON CONFLICT (id) DO NOTHING.',
      'Reference: CREATE TABLE scan_archive (...), then INSERT ... SELECT DISTINCT ... ON CONFLICT (id) DO NOTHING.',
    ],
    docs: DOCS_UPSERT,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c11-b1-p2', chapterId: 11, role: 'boss', bossGroup: 'c11-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 2: the latest event for each shipment',
    ...DISPATCH,
    summary: 'Keep the newest event per shipment, breaking ties by the larger event id, and load it again safely.',
    instructions: 'Create shipment_latest with shipment_id (integer, primary key, must name a shipment), status (text, present), occurred_at (timestamptz, present) and event_id (integer, present). Keep the newest shipment_events row for each shipment. When two events for a shipment share the newest time, keep the one with the larger id. A second run must leave the same rows and must not fail. Write the table and the load.',
    starterSql: 'CREATE TABLE shipment_latest ();\n',
    referenceSql: 'CREATE TABLE shipment_latest (shipment_id integer PRIMARY KEY REFERENCES shipments (id), status text NOT NULL, occurred_at timestamptz NOT NULL, event_id integer NOT NULL);\nINSERT INTO shipment_latest (shipment_id, status, occurred_at, event_id)\nSELECT DISTINCT ON (shipment_id) shipment_id, status, occurred_at, id\nFROM shipment_events\nORDER BY shipment_id, occurred_at DESC, id DESC\nON CONFLICT (shipment_id) DO UPDATE SET status = EXCLUDED.status, occurred_at = EXCLUDED.occurred_at, event_id = EXCLUDED.event_id;',
    policy: UPSERT,
    checks: [{ id: 'latest-rows', label: 'Latest event per shipment', sql: 'SELECT shipment_id, status, occurred_at, event_id FROM shipment_latest ORDER BY shipment_id' }],
    runs: 2,
    columns: [],
    wrongVariants: [
      { id: 'b1p2-tie-asc', mistake: 'TIE_NONDETERMINISTIC', sql: 'CREATE TABLE shipment_latest (shipment_id integer PRIMARY KEY REFERENCES shipments (id), status text NOT NULL, occurred_at timestamptz NOT NULL, event_id integer NOT NULL);\nINSERT INTO shipment_latest (shipment_id, status, occurred_at, event_id)\nSELECT DISTINCT ON (shipment_id) shipment_id, status, occurred_at, id\nFROM shipment_events\nORDER BY shipment_id, occurred_at DESC, id ASC\nON CONFLICT (shipment_id) DO UPDATE SET status = EXCLUDED.status, occurred_at = EXCLUDED.occurred_at, event_id = EXCLUDED.event_id;', explanation: 'It looks like the tie was broken by the smaller id. Some shipments have two events at the newest time, and the ticket says the larger id wins, so the status comes out different.' },
      { id: 'b1p2-plain', mistake: 'UPSERT_DUPLICATE_ON_RERUN', sql: 'CREATE TABLE shipment_latest (shipment_id integer PRIMARY KEY REFERENCES shipments (id), status text NOT NULL, occurred_at timestamptz NOT NULL, event_id integer NOT NULL);\nINSERT INTO shipment_latest (shipment_id, status, occurred_at, event_id)\nSELECT DISTINCT ON (shipment_id) shipment_id, status, occurred_at, id\nFROM shipment_events\nORDER BY shipment_id, occurred_at DESC, id DESC;', explanation: 'It looks like the load has no ON CONFLICT clause. The first run works, but the second run inserts the same shipment ids and the primary key rejects them.' },
    ],
    ordered: true,
    hints: [
      'The newest event is the first row when you sort by time, then by id, in each shipment group. Which two columns break the tie, and in which direction?',
      'DISTINCT ON (shipment_id) with ORDER BY shipment_id, occurred_at DESC, id DESC keeps one row per shipment.',
      'Reference: CREATE TABLE shipment_latest (...), then the DISTINCT ON insert with ON CONFLICT (shipment_id) DO UPDATE.',
    ],
    docs: DOCS_UPSERT,
    datasets: datasetsFor(['nulls', 'ties']),
  },
  {
    id: 'c11-b1-p3', chapterId: 11, role: 'boss', bossGroup: 'c11-boss', starterStyle: 'blanks', title: 'Boss ticket, part 3: a data-quality summary',
    ...REPORTING,
    summary: 'Report three staging problems in one table: repeated scan ids, scans with no shipment, and scans with no status.',
    instructions: 'Produce one row per check with check_name (text) and offending (the number of problems). The three checks are: duplicate scan ids (how many ids appear on more than one row), orphaned scans (scans whose shipment does not exist), and scans without status. A check with no problems still appears, with 0. Order by check_name. The blank is the join type that keeps scans with no matching shipment.',
    starterSql: "SELECT 'duplicate scan ids' AS check_name, COUNT(*)::integer AS offending\nFROM (SELECT id FROM staging_scans GROUP BY id HAVING COUNT(*) > 1) AS dup\nUNION ALL\nSELECT 'orphaned scans', COUNT(*)::integer\nFROM staging_scans AS s\n____ JOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE sh.id IS NULL\nUNION ALL\nSELECT 'scans without status', COUNT(*)::integer\nFROM staging_scans\nWHERE status IS NULL\nORDER BY check_name;",
    referenceSql: "SELECT 'duplicate scan ids' AS check_name, COUNT(*)::integer AS offending\nFROM (SELECT id FROM staging_scans GROUP BY id HAVING COUNT(*) > 1) AS dup\nUNION ALL\nSELECT 'orphaned scans', COUNT(*)::integer\nFROM staging_scans AS s\nLEFT JOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE sh.id IS NULL\nUNION ALL\nSELECT 'scans without status', COUNT(*)::integer\nFROM staging_scans\nWHERE status IS NULL\nORDER BY check_name;",
    columns: [{ name: 'check_name', type: 25 }, { name: 'offending', type: 23 }],
    wrongVariants: [
      { id: 'b1p3-inner', mistake: 'LEFT_TO_INNER', sql: "SELECT 'duplicate scan ids' AS check_name, COUNT(*)::integer AS offending\nFROM (SELECT id FROM staging_scans GROUP BY id HAVING COUNT(*) > 1) AS dup\nUNION ALL\nSELECT 'orphaned scans', COUNT(*)::integer\nFROM staging_scans AS s\nJOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE sh.id IS NULL\nUNION ALL\nSELECT 'scans without status', COUNT(*)::integer\nFROM staging_scans\nWHERE status IS NULL\nORDER BY check_name;", explanation: 'It looks like an inner join was used for the orphan check. An inner join keeps only matching scans, so the orphan count is always zero, and the check reports no problem.' },
      { id: 'b1p3-count-column', mistake: 'COUNT_STAR_VS_COL', sql: "SELECT 'duplicate scan ids' AS check_name, COUNT(*)::integer AS offending\nFROM (SELECT id FROM staging_scans GROUP BY id HAVING COUNT(*) > 1) AS dup\nUNION ALL\nSELECT 'orphaned scans', COUNT(*)::integer\nFROM staging_scans AS s\nLEFT JOIN shipments AS sh ON sh.id = s.shipment_id\nWHERE sh.id IS NULL\nUNION ALL\nSELECT 'scans without status', COUNT(status)::integer\nFROM staging_scans\nORDER BY check_name;", explanation: 'It looks like COUNT(status) was used. It counts the scans that have a status, the opposite of the ticket, so the number reported is the count of good rows.' },
    ],
    ordered: true,
    hints: [
      'Each check is a count. Which join keeps the scans that have no matching shipment, so they can be counted?',
      'LEFT JOIN keeps every scan, and the WHERE on the missing shipment id keeps the orphans.',
      'The blank is LEFT.',
    ],
    docs: [{ label: 'PostgreSQL UNION', url: 'https://www.postgresql.org/docs/18/queries-union.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
];
