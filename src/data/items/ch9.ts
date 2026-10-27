import type { Challenge, CheckQuery, Policy } from '../../core/types';
import { datasetsFor } from '../datasets';

const CONSTRAINTS = 'https://www.postgresql.org/docs/18/ddl-constraints.html';
const CREATE_TABLE = 'https://www.postgresql.org/docs/18/sql-createtable.html';
const TRANSACTIONS = 'https://www.postgresql.org/docs/18/tutorial-transactions.html';
const DOCS = [{ label: 'PostgreSQL CREATE TABLE', url: CREATE_TABLE }, { label: 'PostgreSQL constraints', url: CONSTRAINTS }];
const DOCS_TX = [{ label: 'PostgreSQL transactions', url: TRANSACTIONS }];
const DISPATCH = { colleague: 'Nera Vale', colleagueRole: 'Dispatch coordinator' };
const BILLING = { colleague: 'Pella Reed', colleagueRole: 'Billing analyst' };
const CUSTOMERS = { colleague: 'Tamsin Rowe', colleagueRole: 'Customer success lead' };
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };

const DDL: Policy = { allow: ['CreateStmt'] };
const UPDATE: Policy = { allow: ['UpdateStmt'] };
const INSERT_TX: Policy = { allow: ['InsertStmt'], transactions: true };
const UPDATE_INSERT_TX: Policy = { allow: ['UpdateStmt', 'InsertStmt'], transactions: true };
const DDL_TX: Policy = { allow: ['CreateStmt'], transactions: true };

// Trusted state reads. They run after the learner's statements, inside the same rolled-back transaction.
const columnsOf = (table: string): CheckQuery => ({
  id: `${table}-columns`, label: `Columns of ${table}`,
  sql: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '${table}' ORDER BY ordinal_position`,
});
const constraintsOf = (table: string): CheckQuery => ({
  id: `${table}-constraints`, label: `Constraints on ${table}`,
  sql: `SELECT contype::text AS kind, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = '${table}'::regclass ORDER BY kind, definition`,
});

// Chapter 9: Own the data. Tables, constraints, data changes and transactions are graded by what the database holds afterwards.
export const chapter9Items: readonly Challenge[] = [
  {
    id: 'c9-g1', chapterId: 9, role: 'guided', kind: 'guided', title: 'Create carriers with a primary key',
    ...DISPATCH,
    summary: 'Create a carriers table whose id identifies each carrier and never repeats.',
    instructions: 'Create a table named carriers with two columns. id is an integer that identifies each carrier and can never repeat or be missing. name is text that can never be missing. Column names and types: id (integer), name (text). The blank completes the id column.',
    starterSql: 'CREATE TABLE carriers (\n  id integer ____,\n  name text NOT NULL\n);',
    referenceSql: 'CREATE TABLE carriers (id integer PRIMARY KEY, name text NOT NULL);',
    policy: DDL,
    checks: [columnsOf('carriers'), constraintsOf('carriers')],
    columns: [],
    wrongVariants: [
      { id: 'g1-no-key', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE carriers (id integer, name text NOT NULL);', explanation: 'It looks like the primary key was left out. Without it, the same id can appear on two carriers, and the ticket says each id identifies one carrier.' },
      { id: 'g1-nullable-name', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE carriers (id integer PRIMARY KEY, name text);', explanation: 'It looks like NOT NULL was left off name. A carrier with no name is then accepted, but the ticket says every carrier has a name.' },
    ],
    ordered: true,
    hints: [
      'A primary key is a constraint on one column. Which keyword after the column type declares it?',
      'Write PRIMARY KEY after integer in the id definition.',
      'The blank is PRIMARY KEY. Leave the name column as it is.',
    ],
    docs: DOCS,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-g2', chapterId: 9, role: 'guided', kind: 'guided', title: 'Cancel one shipment, and only that one',
    ...DISPATCH,
    summary: 'Change the status of one shipment with an UPDATE that names it exactly.',
    instructions: 'Mark shipment 7 as cancelled and change no other shipment. The blank is the shipment’s id.',
    starterSql: "UPDATE shipments\nSET status = 'cancelled'\nWHERE id = ____;",
    referenceSql: "UPDATE shipments SET status = 'cancelled' WHERE id = 7;",
    policy: UPDATE,
    checks: [
      { id: 'shipment-window', label: 'Shipments 5 to 9', sql: 'SELECT id, status FROM shipments WHERE id BETWEEN 5 AND 9 ORDER BY id' },
      { id: 'status-counts', label: 'Shipments by status', sql: 'SELECT status, COUNT(*)::integer AS shipments FROM shipments GROUP BY status ORDER BY status' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'g2-no-where', mistake: 'MISSING_WHERE_ON_UPDATE', sql: "UPDATE shipments SET status = 'cancelled';", explanation: 'It looks like the WHERE clause was left out. Every shipment is cancelled, not only shipment 7. An UPDATE without WHERE changes every row in the table.' },
      { id: 'g2-or', mistake: 'AND_OR_PRECEDENCE', sql: "UPDATE shipments SET status = 'cancelled' WHERE status = 'queued' OR id = 7;", explanation: 'It looks like an OR was added. Every queued shipment is cancelled as well as shipment 7. Only the shipment the ticket names should change.' },
    ],
    ordered: true,
    hints: [
      'The ticket names one shipment. Which clause limits an UPDATE to the rows that match?',
      'Keep WHERE id = and put the shipment number from the ticket in the blank.',
      'The blank is 7, the shipment named in the ticket.',
    ],
    docs: [{ label: 'PostgreSQL UPDATE', url: 'https://www.postgresql.org/docs/18/sql-update.html' }],
    datasets: datasetsFor(['ties', 'boundary']),
  },
  {
    id: 'c9-g3', chapterId: 9, role: 'guided', kind: 'guided', title: 'Dry run that leaves no trace',
    ...BILLING,
    summary: 'Test a bulk change inside a transaction, then undo it so the table is as it was.',
    instructions: 'Dry run: clear every paid date to see the effect, then undo the whole change so the invoices end exactly as they started. The blank is the statement that ends the transaction and undoes the change.',
    starterSql: 'BEGIN;\nUPDATE invoices\nSET paid_at = NULL\nWHERE paid_at IS NOT NULL;\n____;',
    referenceSql: 'BEGIN;\nUPDATE invoices SET paid_at = NULL WHERE paid_at IS NOT NULL;\nROLLBACK;',
    policy: { allow: ['UpdateStmt'], transactions: true },
    checks: [
      { id: 'paid-count', label: 'Paid invoices', sql: 'SELECT COUNT(*)::integer AS paid_invoices FROM invoices WHERE paid_at IS NOT NULL' },
      { id: 'paid-sample', label: 'First six invoices', sql: 'SELECT id, paid_at FROM invoices WHERE id <= 6 ORDER BY id' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'g3-commit', mistake: 'ROLLBACK_MISSING', sql: 'BEGIN;\nUPDATE invoices SET paid_at = NULL WHERE paid_at IS NOT NULL;\nCOMMIT;', explanation: 'It looks like COMMIT was used. COMMIT keeps the change, so every paid date is cleared. A dry run must end with ROLLBACK to restore the table.' },
      { id: 'g3-open', mistake: 'ROLLBACK_MISSING', sql: 'BEGIN;\nUPDATE invoices SET paid_at = NULL WHERE paid_at IS NOT NULL;', explanation: 'It looks like the transaction was never ended. The change is still open when the check runs, so the paid dates are cleared. ROLLBACK ends the transaction and restores them.' },
    ],
    ordered: true,
    hints: [
      'The ticket asks you to undo the change. Which statement discards everything since BEGIN?',
      'End with ROLLBACK, not COMMIT. COMMIT would keep the cleared paid dates.',
      'The blank is ROLLBACK.',
    ],
    docs: DOCS_TX,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-g4', chapterId: 9, role: 'guided', kind: 'guided', title: 'Holds that must be positive and must point at a shipment',
    ...PIPELINE,
    summary: 'Create a hold table whose hours must be above zero and whose shipment must exist.',
    instructions: 'Create shipment_holds for the time a shipment waits at a hub. Each hold names a shipment that exists, and hold_hours must be above zero. The blank is the rule for hold_hours. Column names and types: id (integer), shipment_id (integer), hold_hours (integer).',
    starterSql: 'CREATE TABLE shipment_holds (\n  id integer PRIMARY KEY,\n  shipment_id integer NOT NULL REFERENCES shipments (id),\n  hold_hours integer ____\n);',
    referenceSql: 'CREATE TABLE shipment_holds (\n  id integer PRIMARY KEY,\n  shipment_id integer NOT NULL REFERENCES shipments (id),\n  hold_hours integer CHECK (hold_hours > 0)\n);',
    policy: DDL,
    checks: [columnsOf('shipment_holds'), constraintsOf('shipment_holds')],
    constraintTests: [
      { name: 'zero hours rejected', sql: 'INSERT INTO shipment_holds (id, shipment_id, hold_hours) VALUES (1, 1, 0);', expect: 'error', sqlstate: '23' },
      { name: 'five hours accepted', sql: 'INSERT INTO shipment_holds (id, shipment_id, hold_hours) VALUES (2, 1, 5);', expect: 'ok' },
      { name: 'unknown shipment rejected', sql: 'INSERT INTO shipment_holds (id, shipment_id, hold_hours) VALUES (3, 999999, 5);', expect: 'error', sqlstate: '23503' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'g4-no-check', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE shipment_holds (\n  id integer PRIMARY KEY,\n  shipment_id integer NOT NULL REFERENCES shipments (id),\n  hold_hours integer\n);', explanation: 'It looks like the CHECK was left out. A hold of zero hours is accepted, but the ticket requires hours above zero.' },
      { id: 'g4-zero-allowed', mistake: 'GE_VS_GT', sql: 'CREATE TABLE shipment_holds (\n  id integer PRIMARY KEY,\n  shipment_id integer NOT NULL REFERENCES shipments (id),\n  hold_hours integer CHECK (hold_hours >= 0)\n);', explanation: 'It looks like >= was used. Zero passes that test, so a zero-hour hold is accepted. The ticket needs strictly more than zero.' },
    ],
    ordered: true,
    hints: [
      'A rule on one column is a CHECK constraint. Which comparison excludes zero?',
      'Write CHECK (hold_hours > 0) after the column type.',
      'The blank is CHECK (hold_hours > 0).',
    ],
    docs: DOCS,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-i1', chapterId: 9, role: 'independent', kind: 'write', title: 'Carrier codes that never repeat',
    ...CUSTOMERS,
    summary: 'Create carriers so that each carrier has one code that no other carrier shares.',
    instructions: 'Create a table named carriers. Each carrier has an integer id that identifies it and can never repeat or be missing. Each carrier also has a short code, which must be present and unique across carriers, and a name, which must be present. Column names and types: id (integer), code (text), name (text). Write the table definition only.',
    starterSql: 'CREATE TABLE carriers ();\n',
    referenceSql: 'CREATE TABLE carriers (id integer PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL);',
    policy: DDL,
    checks: [columnsOf('carriers'), constraintsOf('carriers')],
    constraintTests: [
      { name: 'duplicate code rejected', sql: "INSERT INTO carriers (id, code, name) VALUES (1, 'HLX', 'Harbor Line'), (2, 'HLX', 'Second Line');", expect: 'error', sqlstate: '23505' },
      { name: 'missing code rejected', sql: "INSERT INTO carriers (id, code, name) VALUES (3, NULL, 'No Code Line');", expect: 'error', sqlstate: '23502' },
      { name: 'distinct codes accepted', sql: "INSERT INTO carriers (id, code, name) VALUES (4, 'RDG', 'Ridge Freight'), (5, 'CDR', 'Cedar Haul');", expect: 'ok' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i1-no-unique', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE carriers (id integer PRIMARY KEY, code text NOT NULL, name text NOT NULL);', explanation: 'It looks like UNIQUE was left off code. Two carriers can then share a code, which the ticket forbids.' },
      { id: 'i1-nullable-code', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE carriers (id integer PRIMARY KEY, code text UNIQUE, name text NOT NULL);', explanation: 'It looks like NOT NULL was left off code. A carrier with no code is then accepted, and the ticket requires a code for every carrier.' },
    ],
    ordered: true,
    hints: [
      'Two rules apply to code: it must be present, and it must not repeat. Which two column constraints express them?',
      'Put NOT NULL and UNIQUE after the code column type.',
      'code text NOT NULL UNIQUE is the whole code column definition.',
    ],
    docs: DOCS,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-i2', chapterId: 9, role: 'independent', kind: 'write', title: 'Assignments that point at real rows',
    ...DISPATCH,
    summary: 'Create a carriers table and an assignments table that can only refer to real carriers and real shipments.',
    instructions: 'Create two tables. carriers has an integer id primary key and a required name (text). shipment_carriers records which carrier takes which shipment, with shipment_id and carrier_id as required integers. Each shipment_id must match a shipment, each carrier_id must match a carrier, and the same pair of shipment_id and carrier_id can appear only once. Write both table definitions. The starter line is a placeholder for carriers: replace it with the full definition, then add shipment_carriers.',
    starterSql: 'CREATE TABLE carriers ();\n',
    referenceSql: 'CREATE TABLE carriers (id integer PRIMARY KEY, name text NOT NULL);\nCREATE TABLE shipment_carriers (shipment_id integer NOT NULL REFERENCES shipments (id), carrier_id integer NOT NULL REFERENCES carriers (id), PRIMARY KEY (shipment_id, carrier_id));',
    policy: DDL,
    checks: [columnsOf('shipment_carriers'), constraintsOf('carriers'), constraintsOf('shipment_carriers')],
    constraintTests: [
      { name: 'unknown carrier rejected', sql: 'INSERT INTO shipment_carriers (shipment_id, carrier_id) VALUES (1, 99);', expect: 'error', sqlstate: '23503' },
      { name: 'unknown shipment rejected', sql: "INSERT INTO carriers (id, name) VALUES (1, 'Harbor Line'); INSERT INTO shipment_carriers (shipment_id, carrier_id) VALUES (999999, 1);", expect: 'error', sqlstate: '23503' },
      { name: 'valid assignment accepted', sql: "INSERT INTO carriers (id, name) VALUES (1, 'Harbor Line'); INSERT INTO shipment_carriers (shipment_id, carrier_id) VALUES (1, 1);", expect: 'ok' },
      { name: 'repeated pair rejected', sql: "INSERT INTO carriers (id, name) VALUES (1, 'Harbor Line'); INSERT INTO shipment_carriers (shipment_id, carrier_id) VALUES (1, 1), (1, 1);", expect: 'error', sqlstate: '23505' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i2-no-carrier-fk', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE carriers (id integer PRIMARY KEY, name text NOT NULL);\nCREATE TABLE shipment_carriers (shipment_id integer NOT NULL REFERENCES shipments (id), carrier_id integer NOT NULL, PRIMARY KEY (shipment_id, carrier_id));', explanation: 'It looks like the reference from carrier_id to carriers was left out. An assignment can then name a carrier that does not exist, which the ticket forbids.' },
      { id: 'i2-no-shipment-fk', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE carriers (id integer PRIMARY KEY, name text NOT NULL);\nCREATE TABLE shipment_carriers (shipment_id integer NOT NULL, carrier_id integer NOT NULL REFERENCES carriers (id), PRIMARY KEY (shipment_id, carrier_id));', explanation: 'It looks like the reference from shipment_id to shipments was left out. An assignment can then name a shipment that does not exist.' },
    ],
    ordered: true,
    hints: [
      'A column that must match another table is a foreign key. Which clause writes that reference?',
      'Each assignment column needs REFERENCES to the table it points at: shipments for shipment_id, carriers for carrier_id.',
      'shipment_id integer NOT NULL REFERENCES shipments (id), and the same pattern for carrier_id.',
    ],
    docs: DOCS,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-i3', chapterId: 9, role: 'independent', kind: 'write', title: 'Unpay invoices of cancelled shipments',
    ...BILLING,
    summary: 'Clear the paid date on the invoices of cancelled shipments, and nothing else.',
    instructions: 'Invoices of shipments whose status is cancelled should have no paid date. Clear paid_at on every invoice whose shipment has status cancelled. Leave every other invoice unchanged. Write one UPDATE statement; use a subquery on shipments to find the cancelled shipments.',
    starterSql: 'UPDATE invoices SET paid_at = paid_at;\n',
    referenceSql: "UPDATE invoices SET paid_at = NULL WHERE shipment_id IN (SELECT id FROM shipments WHERE status = 'cancelled');",
    policy: UPDATE,
    checks: [
      { id: 'paid-by-status', label: 'Paid invoices by shipment status', sql: 'SELECT s.status, COUNT(*) FILTER (WHERE i.paid_at IS NOT NULL)::integer AS paid_invoices FROM invoices AS i JOIN shipments AS s ON s.id = i.shipment_id GROUP BY s.status ORDER BY s.status' },
      { id: 'first-invoices', label: 'First ten invoices', sql: 'SELECT id, paid_at FROM invoices WHERE id <= 10 ORDER BY id' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i3-no-where', mistake: 'MISSING_WHERE_ON_UPDATE', sql: 'UPDATE invoices SET paid_at = NULL;', explanation: 'It looks like the WHERE clause was left out. Every invoice loses its paid date, not only the invoices of cancelled shipments.' },
      { id: 'i3-paid-filter', mistake: 'MISSING_WHERE_ON_UPDATE', sql: 'UPDATE invoices SET paid_at = NULL WHERE paid_at IS NOT NULL;', explanation: 'It looks like the filter checked the invoice’s own paid date instead of the shipment’s status. Paid invoices for shipments that are not cancelled are cleared too.' },
    ],
    ordered: true,
    hints: [
      'The condition is about the shipment, so the UPDATE must reach into shipments. Which clause can hold a subquery?',
      'WHERE shipment_id IN (SELECT id FROM shipments WHERE status = ...) limits the rows to cancelled shipments.',
      "The subquery's condition is status = 'cancelled'.",
    ],
    docs: [{ label: 'PostgreSQL UPDATE', url: 'https://www.postgresql.org/docs/18/sql-update.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-i4', chapterId: 9, role: 'independent', kind: 'write', title: 'Two new customers, kept together',
    ...CUSTOMERS,
    summary: 'Add two customers in one transaction, and keep both.',
    instructions: 'Add two customers: id 9, named Juniper Crate with region North, and id 10, named Kestrel Mills with no region. Write both rows in one transaction and keep them. Column names: id, name, region.',
    starterSql: 'INSERT INTO customers DEFAULT VALUES;\n',
    referenceSql: "BEGIN;\nINSERT INTO customers (id, name, region) VALUES (9, 'Juniper Crate', 'North'), (10, 'Kestrel Mills', NULL);\nCOMMIT;",
    policy: INSERT_TX,
    checks: [
      { id: 'new-customers', label: 'Customers 9 and up', sql: 'SELECT id, name, region FROM customers WHERE id >= 9 ORDER BY id' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i4-rollback', mistake: 'COMMIT_MISSING', sql: "BEGIN;\nINSERT INTO customers (id, name, region) VALUES (9, 'Juniper Crate', 'North'), (10, 'Kestrel Mills', NULL);\nROLLBACK;", explanation: 'It looks like ROLLBACK was used. ROLLBACK discards both customers, so neither appears. COMMIT keeps them.' },
      { id: 'i4-first-only', mistake: 'COMMIT_MISSING', sql: "BEGIN;\nINSERT INTO customers (id, name, region) VALUES (9, 'Juniper Crate', 'North');\nCOMMIT;", explanation: 'It looks like the second customer was left out. The ticket asks for both rows in one transaction, so only one is kept.' },
    ],
    ordered: true,
    hints: [
      'Both rows must be kept, so the transaction must end with the statement that keeps them. Which one?',
      'Start with BEGIN; put both customers in one INSERT; end with COMMIT.',
      'The kept rows are the two in the ticket, with region NULL for Kestrel Mills.',
    ],
    docs: DOCS_TX,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-i5', chapterId: 9, role: 'independent', kind: 'write', title: 'Remove invoices of cancelled shipments',
    ...PIPELINE,
    summary: 'Delete the invoices of cancelled shipments, and only those.',
    instructions: 'Delete every invoice whose shipment has status cancelled. Keep every other invoice. Write one DELETE statement; use a subquery on shipments to find the cancelled shipments.',
    starterSql: 'DELETE FROM invoices;\n',
    referenceSql: "DELETE FROM invoices WHERE shipment_id IN (SELECT id FROM shipments WHERE status = 'cancelled');",
    policy: { allow: ['DeleteStmt'] },
    checks: [
      { id: 'invoice-totals', label: 'Invoices and cancelled-shipment invoices', sql: "SELECT COUNT(*)::integer AS invoices, COUNT(*) FILTER (WHERE s.status = 'cancelled')::integer AS cancelled_invoices FROM invoices AS i JOIN shipments AS s ON s.id = i.shipment_id" },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i5-no-where', mistake: 'MISSING_WHERE_ON_UPDATE', sql: 'DELETE FROM invoices;', explanation: 'It looks like the WHERE clause was left out. Every invoice is deleted, not only the invoices of cancelled shipments.' },
      { id: 'i5-or', mistake: 'AND_OR_PRECEDENCE', sql: "DELETE FROM invoices WHERE shipment_id IN (SELECT id FROM shipments WHERE status = 'cancelled') OR paid_at IS NULL;", explanation: 'It looks like an OR was added. Unpaid invoices are deleted too, including those for shipments that are not cancelled.' },
    ],
    ordered: true,
    hints: [
      'Only invoices of cancelled shipments go. Which clause limits a DELETE to matching rows?',
      'Use the same subquery as an UPDATE would: WHERE shipment_id IN (SELECT id FROM shipments WHERE status = ...).',
      "The condition is shipment status = 'cancelled'.",
    ],
    docs: [{ label: 'PostgreSQL DELETE', url: 'https://www.postgresql.org/docs/18/sql-delete.html' }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-i6', chapterId: 9, role: 'independent', kind: 'write', title: 'Trial table, then undo',
    ...DISPATCH,
    summary: 'Build a trial table inside a transaction and undo it, so the database keeps no trace of it.',
    instructions: 'Try a new table named trial_notes with an integer id primary key and a note text column. Create it inside a transaction, then roll back so the table does not exist afterwards. The starter line is the CREATE TABLE statement; add the BEGIN and the ending.',
    starterSql: 'CREATE TABLE trial_notes ();\n',
    referenceSql: 'BEGIN;\nCREATE TABLE trial_notes (id integer PRIMARY KEY, note text);\nROLLBACK;',
    policy: DDL_TX,
    checks: [
      { id: 'tables', label: 'Tables in this dataset', sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name" },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i6-commit', mistake: 'ROLLBACK_MISSING', sql: 'BEGIN;\nCREATE TABLE trial_notes (id integer PRIMARY KEY, note text);\nCOMMIT;', explanation: 'It looks like COMMIT was used. The table is kept, so it still exists after the trial. ROLLBACK removes it.' },
      { id: 'i6-open', mistake: 'ROLLBACK_MISSING', sql: 'BEGIN;\nCREATE TABLE trial_notes (id integer PRIMARY KEY, note text);', explanation: 'It looks like the transaction was never ended. The table is still there when the check runs. ROLLBACK ends the transaction and removes it.' },
    ],
    ordered: true,
    hints: [
      'The table must not survive the trial. Which ending undoes everything since BEGIN?',
      'BEGIN; then the CREATE TABLE statement, then ROLLBACK;',
      'The only change to the starter is the BEGIN line before it and the ROLLBACK line after it.',
    ],
    docs: DOCS_TX,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-b1-p1', chapterId: 9, role: 'boss', bossGroup: 'c9-boss', kind: 'write', title: 'Boss ticket, part 1: the rate card table',
    ...CUSTOMERS,
    summary: 'Create the rate card: a carrier and lane pair is unique, and every rate is above zero.',
    instructions: 'Create a table named rate_card. Each row has an integer id primary key, a carrier_code and a lane (both required text), and a rate_per_kg, a numeric(8,2) value that is required and must be above zero. A carrier can list each lane only once. Write the table definition only.',
    starterSql: 'CREATE TABLE rate_card ();\n',
    referenceSql: 'CREATE TABLE rate_card (id integer PRIMARY KEY, carrier_code text NOT NULL, lane text NOT NULL, rate_per_kg numeric(8,2) NOT NULL CHECK (rate_per_kg > 0), UNIQUE (carrier_code, lane));',
    policy: DDL,
    checks: [columnsOf('rate_card'), constraintsOf('rate_card')],
    constraintTests: [
      { name: 'zero rate rejected', sql: "INSERT INTO rate_card (id, carrier_code, lane, rate_per_kg) VALUES (1, 'HLX', 'A-B', 0);", expect: 'error', sqlstate: '23514' },
      { name: 'repeated lane rejected', sql: "INSERT INTO rate_card (id, carrier_code, lane, rate_per_kg) VALUES (1, 'HLX', 'A-B', 2.50), (2, 'HLX', 'A-B', 3.10);", expect: 'error', sqlstate: '23505' },
      { name: 'valid rate accepted', sql: "INSERT INTO rate_card (id, carrier_code, lane, rate_per_kg) VALUES (3, 'HLX', 'A-B', 2.50);", expect: 'ok' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'p1-no-check', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE rate_card (id integer PRIMARY KEY, carrier_code text NOT NULL, lane text NOT NULL, rate_per_kg numeric(8,2) NOT NULL, UNIQUE (carrier_code, lane));', explanation: 'It looks like the CHECK on rate_per_kg was left out. A rate of zero is accepted, but the ticket requires every rate to be above zero.' },
      { id: 'p1-zero-allowed', mistake: 'GE_VS_GT', sql: 'CREATE TABLE rate_card (id integer PRIMARY KEY, carrier_code text NOT NULL, lane text NOT NULL, rate_per_kg numeric(8,2) NOT NULL CHECK (rate_per_kg >= 0), UNIQUE (carrier_code, lane));', explanation: 'It looks like >= was used. Zero passes that test, so a zero rate is accepted. The ticket needs strictly more than zero.' },
    ],
    ordered: true,
    hints: [
      'Two constraints are asked for: uniqueness of the carrier and lane pair, and a rule on rate_per_kg. Which clauses express each?',
      'UNIQUE (carrier_code, lane) is a table constraint; CHECK (rate_per_kg > 0) goes on the rate column.',
      'Write the rate column as numeric(8,2) NOT NULL CHECK (rate_per_kg > 0).',
    ],
    docs: DOCS,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c9-b1-p2', chapterId: 9, role: 'boss', bossGroup: 'c9-boss', kind: 'write', title: 'Boss ticket, part 2: raise invoices on route 1',
    ...BILLING,
    summary: 'Raise the invoice amounts for route 1 by ten percent, rounded to cents, and leave the rest alone.',
    instructions: 'Raise the amount of every invoice whose shipment is on route 1 by ten percent, rounded to two decimal places. Leave the other invoices unchanged. Write one UPDATE statement.',
    starterSql: 'UPDATE invoices SET amount = amount;\n',
    referenceSql: 'UPDATE invoices SET amount = ROUND(amount * 1.10, 2) WHERE shipment_id IN (SELECT id FROM shipments WHERE route_id = 1);',
    policy: UPDATE,
    checks: [
      { id: 'route-one-invoices', label: 'Invoice amounts on route 1', sql: 'SELECT i.id, i.amount FROM invoices AS i JOIN shipments AS s ON s.id = i.shipment_id WHERE s.route_id = 1 ORDER BY i.id' },
      { id: 'invoice-total', label: 'Total of all invoices', sql: 'SELECT SUM(amount) AS total FROM invoices' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'p2-all-invoices', mistake: 'MISSING_WHERE_ON_UPDATE', sql: 'UPDATE invoices SET amount = ROUND(amount * 1.10, 2);', explanation: 'It looks like the WHERE clause was left out. Every invoice is raised, not only the invoices on route 1.' },
      { id: 'p2-whole-units', mistake: 'CAST_ROUNDING', sql: 'UPDATE invoices SET amount = ROUND(amount * 1.10) WHERE shipment_id IN (SELECT id FROM shipments WHERE route_id = 1);', explanation: 'It looks like ROUND was given no places. That rounds to whole units, not cents, so a 137.50 amount becomes 138.00.' },
    ],
    ordered: true,
    hints: [
      'Only the route 1 invoices change. Which subquery finds the shipments on route 1?',
      'The new amount is ROUND(amount * 1.10, 2), and the WHERE uses shipment_id IN (SELECT id FROM shipments WHERE route_id = ...).',
      'The route number in the subquery is 1.',
    ],
    docs: [{ label: 'PostgreSQL UPDATE', url: 'https://www.postgresql.org/docs/18/sql-update.html' }],
    datasets: datasetsFor(['precision', 'boundary']),
  },
  {
    id: 'c9-b1-p3', chapterId: 9, role: 'boss', bossGroup: 'c9-boss', kind: 'write', title: 'Boss ticket, part 3: deliver and record, as one unit',
    ...PIPELINE,
    summary: 'Mark shipment 3 delivered and add its delivered scan, keeping both or neither.',
    instructions: 'Mark shipment 3 as delivered and add a delivered scan for it with id 1000, occurred at 2026-02-01 10:00 UTC, and no note. Both changes belong in one transaction, and both must be kept. Column names for the scan: id, shipment_id, status, occurred_at, note.',
    starterSql: 'UPDATE shipments SET status = status;\n',
    referenceSql: "BEGIN;\nUPDATE shipments SET status = 'delivered' WHERE id = 3;\nINSERT INTO shipment_events (id, shipment_id, status, occurred_at, note) VALUES (1000, 3, 'delivered', '2026-02-01T10:00:00Z', NULL);\nCOMMIT;",
    policy: UPDATE_INSERT_TX,
    checks: [
      { id: 'shipment-three', label: 'Shipment 3', sql: 'SELECT id, status FROM shipments WHERE id = 3' },
      { id: 'scan-1000', label: 'Scan 1000', sql: 'SELECT id, shipment_id, status, occurred_at FROM shipment_events WHERE id = 1000' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'p3-rollback', mistake: 'COMMIT_MISSING', sql: "BEGIN;\nUPDATE shipments SET status = 'delivered' WHERE id = 3;\nINSERT INTO shipment_events (id, shipment_id, status, occurred_at, note) VALUES (1000, 3, 'delivered', '2026-02-01T10:00:00Z', NULL);\nROLLBACK;", explanation: 'It looks like ROLLBACK was used. Both changes are discarded, so shipment 3 keeps its old status and the scan is missing. COMMIT keeps both.' },
      { id: 'p3-no-status', mistake: 'COMMIT_MISSING', sql: "BEGIN;\nINSERT INTO shipment_events (id, shipment_id, status, occurred_at, note) VALUES (1000, 3, 'delivered', '2026-02-01T10:00:00Z', NULL);\nCOMMIT;", explanation: 'It looks like the shipment update was left out. The scan says delivered, but the shipment keeps its old status. The ticket keeps both changes together.' },
    ],
    ordered: true,
    hints: [
      'Two changes must be kept together. Which transaction statement wraps both and keeps them?',
      'Start with BEGIN;, then the UPDATE and the INSERT, then COMMIT;.',
      "The UPDATE sets status = 'delivered' for shipment 3, and the INSERT adds the scan with id 1000.",
    ],
    docs: DOCS_TX,
    datasets: datasetsFor(['ties', 'boundary']),
  },
];
