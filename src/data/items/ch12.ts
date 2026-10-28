import type { Challenge, CheckQuery, Policy } from '../../core/types';
import { datasetsFor } from '../datasets';

const CREATE_INDEX = 'https://www.postgresql.org/docs/18/sql-createindex.html';
const EXPLAIN = 'https://www.postgresql.org/docs/18/sql-explain.html';
const DOCS_INDEX = [{ label: 'PostgreSQL CREATE INDEX', url: CREATE_INDEX }];
const DOCS_PLAN = [{ label: 'PostgreSQL EXPLAIN', url: EXPLAIN }];
const DISPATCH = { colleague: 'Nera Vale', colleagueRole: 'Dispatch coordinator' };
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };
const REPORTING = { colleague: 'Tarin Wren', colleagueRole: 'Reporting analyst' };
const CUSTOMERS = { colleague: 'Tamsin Rowe', colleagueRole: 'Customer success lead' };

const INDEX_ONLY: Policy = { allow: ['IndexStmt'] };

// Catalog state: every non-primary-key index in the schema, with its columns in index order. Index names are left out.
const INDEXES: CheckQuery = {
  id: 'indexes', label: 'Indexes (columns in index order)',
  sql: "SELECT t.relname AS table_name, string_agg(a.attname, ',' ORDER BY k.ord) AS index_columns FROM pg_index AS i JOIN pg_class AS t ON t.oid = i.indrelid JOIN pg_namespace AS n ON n.oid = t.relnamespace JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) ON true JOIN pg_attribute AS a ON a.attrelid = t.oid AND a.attnum = k.attnum WHERE n.nspname = current_schema() AND NOT i.indisprimary GROUP BY i.indexrelid, t.relname ORDER BY 1, 2",
};
const SCAN_PLAN = { mustContain: ['Index Scan'], mustNotContain: ['Seq Scan'] };

// Chapter 12: Make it efficient. Index tickets are graded by catalog state; plan tickets are graded by rows and by the planner's node types.
export const chapter12Items: readonly Challenge[] = [
  {
    id: 'c12-g1', chapterId: 12, role: 'guided', starterStyle: 'blanks', title: 'Index the scans by shipment',
    ...DISPATCH,
    summary: 'Create an index on shipment_scans_large so that a lookup by shipment does not read every scan.',
    instructions: 'Scans are looked up by shipment_id, and shipment_scans_large has an index only on its primary key. Create an index on shipment_id of shipment_scans_large. The index name does not matter. The blank is the column the index covers.',
    starterSql: 'CREATE INDEX scans_by_shipment ON shipment_scans_large (____);',
    referenceSql: 'CREATE INDEX scans_by_shipment ON shipment_scans_large (shipment_id);',
    policy: INDEX_ONLY,
    checks: [INDEXES],
    columns: [],
    wrongVariants: [
      { id: 'g1-wrong-column', mistake: 'INDEX_WRONG_COLUMN', sql: 'CREATE INDEX scans_by_shipment ON shipment_scans_large (id);', explanation: 'It looks like the index covers id, the primary key. That column already has an index, so the lookup by shipment_id still reads every scan.' },
      { id: 'g1-other-table', mistake: 'INDEX_MISSING', sql: 'CREATE INDEX scans_by_shipment ON shipments (route_id);', explanation: 'It looks like the index was created on the shipments table. The scans table still has no index on shipment_id, so the lookup is unchanged.' },
    ],
    ordered: true,
    hints: [
      'The ticket says scans are looked up by one column. Which column is that?',
      'Name shipment_id between the parentheses, on the shipment_scans_large table.',
      'The blank is shipment_id.',
    ],
    docs: DOCS_INDEX,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-g2', chapterId: 12, role: 'guided', starterStyle: 'broken', title: 'Find one scan without reading the table',
    ...DISPATCH,
    summary: 'Fetch scan 42 by its primary key. The query returns the right row but reads every row to find it.',
    instructions: 'The ticket asks for scan 42. The query works, but a function around id stops the planner from using the primary key index. Rewrite the condition so the planner can use the primary key. The rows returned must not change.',
    starterSql: 'SELECT id, shipment_id, status, occurred_at\nFROM shipment_scans_large\nWHERE id + 0 = 42;',
    referenceSql: 'SELECT id, shipment_id, status, occurred_at\nFROM shipment_scans_large\nWHERE id = 42;',
    columns: [{ name: 'id', type: 23 }, { name: 'shipment_id', type: 23 }, { name: 'status', type: 25 }, { name: 'occurred_at', type: 1184 }],
    plan: SCAN_PLAN,
    wrongVariants: [
      { id: 'g2-cast', mistake: 'FUNCTION_ON_INDEXED_COLUMN', sql: "SELECT id, shipment_id, status, occurred_at\nFROM shipment_scans_large\nWHERE CAST(id AS text) = '42';", explanation: 'It looks like id was cast to text. The cast hides the column from the primary key index, so the planner reads every scan. Compare the column with a value of its own type.' },
      { id: 'g2-times-one', mistake: 'FUNCTION_ON_INDEXED_COLUMN', sql: 'SELECT id, shipment_id, status, occurred_at\nFROM shipment_scans_large\nWHERE id * 1 = 42;', explanation: 'It looks like id was multiplied by 1. The result is the same, but the expression on id stops the primary key index from being used.' },
    ],
    ordered: true,
    hints: [
      'The planner can use an index on id only when id is compared as itself. What is added to id in the starter?',
      'Remove the + 0 so the condition reads WHERE id = 42.',
      'Reference: SELECT ... FROM shipment_scans_large WHERE id = 42.',
    ],
    docs: DOCS_PLAN,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-i1', chapterId: 12, role: 'independent', starterStyle: 'skeleton', title: 'Scans in one id range, in order',
    ...PIPELINE,
    summary: 'List the status of scans 100 to 110, in id order, using the primary key for the range.',
    instructions: 'List the id and status of each scan from 100 to 110 inclusive, in id order. Use a condition on id that the primary key index can answer. Write the query only.',
    starterSql: 'SELECT id, status\nFROM shipment_scans_large;\n',
    referenceSql: 'SELECT id, status\nFROM shipment_scans_large\nWHERE id BETWEEN 100 AND 110\nORDER BY id;',
    columns: [{ name: 'id', type: 23 }, { name: 'status', type: 25 }],
    plan: SCAN_PLAN,
    wrongVariants: [
      { id: 'i1-end-bound', mistake: 'BETWEEN_END_BOUND', sql: 'SELECT id, status\nFROM shipment_scans_large\nWHERE id BETWEEN 100 AND 109\nORDER BY id;', explanation: 'It looks like the end of the range was written as 109. BETWEEN includes both ends, so scan 110 is missing from the list.' },
      { id: 'i1-wrapped', mistake: 'FUNCTION_ON_INDEXED_COLUMN', sql: 'SELECT id, status\nFROM shipment_scans_large\nWHERE id + 0 BETWEEN 100 AND 110\nORDER BY id;', explanation: 'It looks like id was wrapped in an expression. The rows are right, but the planner reads every scan because it cannot use the primary key for the range.' },
    ],
    ordered: true,
    hints: [
      'BETWEEN is a range test on one column. Which column should the test be on, and does it include both ends?',
      'Write WHERE id BETWEEN 100 AND 110, with the condition on id as it is stored.',
      'Reference: SELECT id, status FROM shipment_scans_large WHERE id BETWEEN 100 AND 110 ORDER BY id.',
    ],
    docs: DOCS_PLAN,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-i2', chapterId: 12, role: 'independent', starterStyle: 'skeleton', title: 'Delivered shipments with only the columns the report needs',
    ...CUSTOMERS,
    summary: 'List the tracking code and customer name of each delivered shipment, without the other shipment columns.',
    instructions: 'List the tracking code and the customer name of each shipment whose status is delivered, ordered by tracking code. Show two columns: tracking_code (text) and customer_name (text). The report needs only these two columns, so list no others. Write the query only.',
    starterSql: 'SELECT tracking_code, customer_id\nFROM shipments;\n',
    referenceSql: "SELECT s.tracking_code, c.name AS customer_name\nFROM shipments AS s\nJOIN customers AS c ON c.id = s.customer_id\nWHERE s.status = 'delivered'\nORDER BY s.tracking_code;",
    columns: [{ name: 'tracking_code', type: 25 }, { name: 'customer_name', type: 25 }],
    wrongVariants: [
      { id: 'i2-star', mistake: 'SELECT_STAR_COST', sql: "SELECT s.*, c.name AS customer_name\nFROM shipments AS s\nJOIN customers AS c ON c.id = s.customer_id\nWHERE s.status = 'delivered'\nORDER BY s.tracking_code;", explanation: 'It looks like every shipment column was selected. The report needs two columns. Extra columns add work for the query and widen the result that the report reads.' },
      { id: 'i2-wrong-key', mistake: 'JOIN_KEY', sql: "SELECT s.tracking_code, c.name AS customer_name\nFROM shipments AS s\nJOIN customers AS c ON c.id = s.driver_id\nWHERE s.status = 'delivered'\nORDER BY s.tracking_code;", explanation: 'It looks like the join used driver_id instead of customer_id. Each shipment is then paired with the customer whose number matches its driver, which is the wrong customer, and shipments with no driver drop out.' },
    ],
    ordered: true,
    hints: [
      'A shipment names its customer in customer_id. Which column of customers holds the same number?',
      'Join shipments to customers on customers.id = shipments.customer_id, and keep only the two columns the report needs.',
      'Reference: SELECT s.tracking_code, c.name AS customer_name FROM shipments AS s JOIN customers AS c ON c.id = s.customer_id WHERE s.status = delivered ORDER BY s.tracking_code.',
    ],
    docs: [{ label: 'PostgreSQL SELECT', url: 'https://www.postgresql.org/docs/18/sql-select.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-i3', chapterId: 12, role: 'independent', starterStyle: 'skeleton', title: 'The five newest scans',
    ...REPORTING,
    summary: 'Show the five scans with the largest ids, newest first, using the primary key for the order.',
    instructions: 'List the id and status of the five scans with the largest ids, largest first. Use an ordering the primary key index can supply. Write the query only.',
    starterSql: 'SELECT id, status\nFROM shipment_scans_large;\n',
    referenceSql: 'SELECT id, status\nFROM shipment_scans_large\nORDER BY id DESC\nLIMIT 5;',
    columns: [{ name: 'id', type: 23 }, { name: 'status', type: 25 }],
    plan: { mustContain: ['Index Scan'], mustNotContain: ['Seq Scan'] },
    wrongVariants: [
      { id: 'i3-ascending', mistake: 'ORDER_DIRECTION', sql: 'SELECT id, status\nFROM shipment_scans_large\nORDER BY id\nLIMIT 5;', explanation: 'It looks like the order was left ascending. The query returns the five oldest scans, not the five newest.' },
      { id: 'i3-wrapped', mistake: 'FUNCTION_ON_INDEXED_COLUMN', sql: 'SELECT id, status\nFROM shipment_scans_large\nORDER BY id + 0 DESC\nLIMIT 5;', explanation: 'It looks like id was wrapped in an expression in the ORDER BY. The rows are right, but the planner must sort every scan instead of reading the index from the top.' },
    ],
    ordered: true,
    hints: [
      'The newest scans have the largest ids. Which direction does the ordering need?',
      'ORDER BY id DESC with LIMIT 5 returns the five largest ids, and the primary key index can supply that order.',
      'Reference: SELECT id, status FROM shipment_scans_large ORDER BY id DESC LIMIT 5.',
    ],
    docs: DOCS_PLAN,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-i4', chapterId: 12, role: 'independent', starterStyle: 'skeleton', title: 'Early deliveries, by a prefix',
    ...PIPELINE,
    summary: 'Among the first fifty scans, list those whose status begins with “del”.',
    instructions: 'List the id and status of each scan among the first fifty (ids 1 to 50) whose status begins with del, in id order. Statuses are lowercase, so the match is exact in case. A prefix match can use an index; a match on the end of the value cannot. Write the query only.',
    starterSql: 'SELECT id, status\nFROM shipment_scans_large;\n',
    referenceSql: "SELECT id, status\nFROM shipment_scans_large\nWHERE id <= 50 AND status LIKE 'del%'\nORDER BY id;",
    columns: [{ name: 'id', type: 23 }, { name: 'status', type: 25 }],
    wrongVariants: [
      { id: 'i4-leading', mistake: 'LEADING_WILDCARD', sql: "SELECT id, status\nFROM shipment_scans_large\nWHERE id <= 50 AND status LIKE '%ed'\nORDER BY id;", explanation: 'It looks like the wildcard was put first. The pattern now matches any status that ends in ed, such as booked and loaded, and it cannot be answered by a prefix search.' },
      { id: 'i4-strict', mistake: 'BETWEEN_END_BOUND', sql: "SELECT id, status\nFROM shipment_scans_large\nWHERE id <= 51 AND status LIKE 'del%'\nORDER BY id;", explanation: 'It looks like the range runs one scan past the fifty the ticket names. Scan 51 is delivered, so it is listed as well.' },
    ],
    ordered: true,
    hints: [
      'A prefix pattern puts the wildcard after the text. Where does the wildcard go in del%?',
      'Keep the wildcard at the end, and use id <= 50 for the first fifty.',
      'Reference: SELECT id, status FROM shipment_scans_large WHERE id <= 50 AND status LIKE \'del%\' ORDER BY id.',
    ],
    docs: [{ label: 'PostgreSQL pattern matching', url: 'https://www.postgresql.org/docs/18/functions-matching.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-i5', chapterId: 12, role: 'independent', starterStyle: 'empty', title: 'Index the scans for shipment lookups',
    ...PIPELINE,
    summary: 'Add one index that serves lookups of scans by shipment, in time order.',
    instructions: 'Scans are looked up by shipment_id, and each lookup reads the scans in occurred_at order. shipment_scans_large has an index only on its primary key. Add one index on shipment_scans_large that covers shipment_id and occurred_at, with shipment_id first, so the lookup can use it. The index name does not matter. The index is created once. Write the index only.',
    starterSql: '',
    referenceSql: 'CREATE INDEX scans_by_shipment_time ON shipment_scans_large (shipment_id, occurred_at);',
    policy: INDEX_ONLY,
    checks: [INDEXES],
    columns: [],
    rules: [
      { id: 'covers-shipment-id', text: 'The index covers shipment_id.' },
      { id: 'shipment-id-first', text: 'shipment_id comes first, because the lookup starts from it.' },
    ],
    wrongVariants: [
      { id: 'i5-wrong-column', rule: 'covers-shipment-id', mistake: 'INDEX_WRONG_COLUMN', sql: 'CREATE INDEX scans_by_shipment_time ON shipment_scans_large (status, occurred_at);', explanation: 'It looks like the index was built on status. The lookup is by shipment_id, so an index on status does not help it, and the scans still have to be read.' },
      { id: 'i5-wrong-order', rule: 'shipment-id-first', mistake: 'INDEX_COLUMN_ORDER', sql: 'CREATE INDEX scans_by_shipment_time ON shipment_scans_large (occurred_at, shipment_id);', explanation: 'It looks like the columns were listed in the wrong order. An index is searched from its first column, so with occurred_at first, a lookup by shipment_id cannot start from the index.' },
    ],
    ordered: true,
    hints: [
      'A lookup by shipment_id can use an index only when that column leads the index. Which column does the ticket want first?',
      'Build one index with shipment_id first and occurred_at second, so each shipment’s scans are found in time order.',
      'Reference: CREATE INDEX on shipment_scans_large (shipment_id, occurred_at).',
    ],
    docs: DOCS_INDEX,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-b1-p1', chapterId: 12, role: 'boss', bossGroup: 'c12-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 1: an arrived scan in an id window',
    ...REPORTING,
    summary: 'Find the arrived scans among ids 1000 to 1010, using the primary key for the window.',
    instructions: 'List the id, shipment_id and occurred_at of each arrived scan with an id from 1000 to 1010 inclusive, in id order. The condition on id must be one the primary key index can answer. Write the query only.',
    starterSql: 'SELECT id, shipment_id, occurred_at\nFROM shipment_scans_large;\n',
    referenceSql: "SELECT id, shipment_id, occurred_at\nFROM shipment_scans_large\nWHERE id BETWEEN 1000 AND 1010 AND status = 'arrived'\nORDER BY id;",
    columns: [{ name: 'id', type: 23 }, { name: 'shipment_id', type: 23 }, { name: 'occurred_at', type: 1184 }],
    plan: SCAN_PLAN,
    wrongVariants: [
      { id: 'b1p1-wrapped-window', mistake: 'FUNCTION_ON_INDEXED_COLUMN', sql: "SELECT id, shipment_id, occurred_at\nFROM shipment_scans_large\nWHERE status = 'arrived' AND id + 0 BETWEEN 1000 AND 1010\nORDER BY id;", explanation: 'It looks like id was wrapped in an expression. The rows are right, but the window cannot use the primary key, so every scan is read.' },
      { id: 'b1p1-end-bound', mistake: 'BETWEEN_END_BOUND', sql: "SELECT id, shipment_id, occurred_at\nFROM shipment_scans_large\nWHERE id BETWEEN 1000 AND 1009 AND status = 'arrived'\nORDER BY id;", explanation: 'It looks like the window ends at 1009. Scan 1010 is inside the window, and BETWEEN includes its end.' },
    ],
    ordered: true,
    hints: [
      'The window is on id and the status test is a filter. Which column should the range test use?',
      'Use BETWEEN 1000 AND 1010 on id as it is stored, then AND the status test.',
      'Reference: SELECT ... FROM shipment_scans_large WHERE id BETWEEN 1000 AND 1010 AND status = \'arrived\' ORDER BY id.',
    ],
    docs: DOCS_PLAN,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-b1-p2', chapterId: 12, role: 'boss', bossGroup: 'c12-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 2: the last delivered scan before 5000',
    ...REPORTING,
    summary: 'Find the delivered scan with the largest id below 5000, with an order the index can supply.',
    instructions: 'Return the id and status of the single delivered scan with the largest id below 5000, as one row. Use an ordering the primary key index can supply. Write the query only.',
    starterSql: 'SELECT id, status\nFROM shipment_scans_large;\n',
    referenceSql: "SELECT id, status\nFROM shipment_scans_large\nWHERE id < 5000 AND status = 'delivered'\nORDER BY id DESC\nLIMIT 1;",
    columns: [{ name: 'id', type: 23 }, { name: 'status', type: 25 }],
    plan: { mustContain: ['Index Scan'], mustNotContain: ['Seq Scan', 'Sort'] },
    wrongVariants: [
      { id: 'b1p2-ascending', mistake: 'ORDER_DIRECTION', sql: "SELECT id, status\nFROM shipment_scans_large\nWHERE id < 5000 AND status = 'delivered'\nORDER BY id\nLIMIT 1;", explanation: 'It looks like the order was left ascending. The query returns the smallest delivered id, not the largest one below 5000.' },
      { id: 'b1p2-wrapped', mistake: 'FUNCTION_ON_INDEXED_COLUMN', sql: "SELECT id, status\nFROM shipment_scans_large\nWHERE id < 5000 AND status = 'delivered'\nORDER BY id + 0 DESC\nLIMIT 1;", explanation: 'It looks like id was wrapped in an expression in the ORDER BY. The planner cannot read the primary key index in that order, so it sorts every scan before it takes one row.' },
    ],
    ordered: true,
    hints: [
      'You need the largest id that satisfies two tests. Which direction gives the largest id first?',
      'Filter on id < 5000 and the status, sort by id DESC, and keep one row.',
      'Reference: SELECT id, status FROM shipment_scans_large WHERE id < 5000 AND status = \'delivered\' ORDER BY id DESC LIMIT 1.',
    ],
    docs: DOCS_PLAN,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c12-b1-p3', chapterId: 12, role: 'boss', bossGroup: 'c12-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 3: status counts for the first 200 scans',
    ...REPORTING,
    summary: 'Count the scans in each status among the first 200 scans, with one row per status.',
    instructions: 'Count the scans with ids 1 to 200 inclusive for each status. Show two columns: status (text) and scans (integer, the count), ordered by status. Write the query only.',
    starterSql: 'SELECT status, id\nFROM shipment_scans_large;\n',
    referenceSql: 'SELECT status, COUNT(*)::integer AS scans\nFROM shipment_scans_large\nWHERE id <= 200\nGROUP BY status\nORDER BY status;',
    columns: [{ name: 'status', type: 25 }, { name: 'scans', type: 23 }],
    wrongVariants: [
      { id: 'b1p3-strict', mistake: 'GE_VS_GT', sql: 'SELECT status, COUNT(*)::integer AS scans\nFROM shipment_scans_large\nWHERE id < 200\nGROUP BY status\nORDER BY status;', explanation: 'It looks like the range was written as below 200. Scan 200 is left out, and the ticket asks for ids 1 to 200 inclusive.' },
      { id: 'b1p3-or', mistake: 'AND_OR_PRECEDENCE', sql: "SELECT status, COUNT(*)::integer AS scans\nFROM shipment_scans_large\nWHERE id <= 200 OR status = 'booked'\nGROUP BY status\nORDER BY status;", explanation: 'It looks like an OR was added. Every booked scan in the whole table is counted as well, not only those in the first 200.' },
    ],
    ordered: true,
    hints: [
      'The count is per status, and only scans with ids up to 200 are included. Which clause limits the rows before grouping?',
      'Put WHERE id <= 200 before GROUP BY status, then count rows per status.',
      'Reference: SELECT status, COUNT(*) ... WHERE id <= 200 GROUP BY status ORDER BY status.',
    ],
    docs: [{ label: 'PostgreSQL aggregate functions', url: 'https://www.postgresql.org/docs/18/tutorial-agg.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
];
