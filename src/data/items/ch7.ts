import type { Challenge } from '../../core/types';
import { datasetsFor } from '../datasets';

const SETOPS = 'https://www.postgresql.org/docs/18/queries-union.html';
const DISPATCH = { colleague: 'Nera Vale', colleagueRole: 'Dispatch coordinator' };
const BILLING = { colleague: 'Pella Reed', colleagueRole: 'Billing analyst' };
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };
const ROUTES = { colleague: 'Ravi Okafor', colleagueRole: 'Route planner' };
const CUSTOMERS = { colleague: 'Tamsin Rowe', colleagueRole: 'Customer success lead' };

// Chapter 7: Combine the feeds. Set operations compare whole rows; UNION, INTERSECT and EXCEPT remove repeats unless ALL is used.
export const chapter7Items: readonly Challenge[] = [
  {
    id: 'c7-g1', chapterId: 7, role: 'guided', kind: 'guided', title: 'Every status in both feeds',
    ...DISPATCH,
    summary: 'Combine the shipment statuses with the scan statuses into one list with no repeats.',
    instructions: 'Return status for every distinct value that appears in shipments.status or in shipment_events.status, sorted from A to Z. Column name and type: status (text).',
    starterSql: 'SELECT status FROM shipments ____ SELECT status FROM shipment_events ORDER BY status;',
    referenceSql: 'SELECT status FROM shipments UNION SELECT status FROM shipment_events ORDER BY status;',
    wrongVariants: [
      { id: 'g1-all', mistake: 'UNION_DEDUPES', sql: 'SELECT status FROM shipments UNION ALL SELECT status FROM shipment_events ORDER BY status;', explanation: 'It looks like UNION ALL was used. It keeps every row, so a status that appears in both feeds, such as delivered, is listed twice. UNION lists each value once.' },
      { id: 'g1-intersect', mistake: 'SET_OPERATOR_CHOICE', sql: 'SELECT status FROM shipments INTERSECT SELECT status FROM shipment_events ORDER BY status;', explanation: 'It looks like INTERSECT was used. INTERSECT keeps only the values that appear in both feeds. The ticket asks for values from either feed.' },
    ],
    ordered: true,
    columns: [{ name: 'status', type: 25 }],
    hints: [
      'A value that appears in both feeds should be listed once. Which set operation joins two results and removes repeats?',
      'UNION joins the two SELECTs. Keep the single ORDER BY at the end, so it sorts the combined list.',
      'SELECT status FROM shipments UNION SELECT status FROM shipment_events ORDER BY status;',
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c7-g2', chapterId: 7, role: 'guided', kind: 'guided', title: 'Shipments that were never billed',
    ...BILLING,
    summary: 'List the shipments with no invoice by taking the billed ids away from all the shipment ids.',
    instructions: 'Return id for every shipment whose id does not appear as shipment_id in invoices. Order by id. Column name and type: id (integer).',
    starterSql: 'SELECT id FROM shipments ____ SELECT shipment_id FROM invoices ORDER BY id;',
    referenceSql: 'SELECT id FROM shipments EXCEPT SELECT shipment_id FROM invoices ORDER BY id;',
    wrongVariants: [
      { id: 'g2-union', mistake: 'SET_OPERATOR_CHOICE', sql: 'SELECT id FROM shipments UNION SELECT shipment_id FROM invoices ORDER BY id;', explanation: 'It looks like UNION was used. UNION adds the billed shipment ids to the list, so nearly every shipment appears. EXCEPT removes the billed ones.' },
      { id: 'g2-intersect', mistake: 'SET_OPERATOR_CHOICE', sql: 'SELECT id FROM shipments INTERSECT SELECT shipment_id FROM invoices ORDER BY id;', explanation: 'It looks like INTERSECT was used. INTERSECT returns the billed shipments. The ticket asks for the ones with no invoice, which is EXCEPT.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }],
    hints: [
      'The ticket asks for shipments that are not in the invoice list. Which set operation keeps the first list minus the second?',
      'EXCEPT keeps the rows of the first query that are missing from the second.',
      'SELECT id FROM shipments EXCEPT SELECT shipment_id FROM invoices ORDER BY id;',
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
  {
    id: 'c7-i1', chapterId: 7, role: 'independent', kind: 'write', title: 'Queued or billed shipments',
    ...PIPELINE,
    summary: 'Build the work list for billing: shipments still queued, or shipments that already have an invoice, each listed once.',
    instructions: 'Return id for every shipment that is queued (status queued), together with every shipment id that appears in invoices.shipment_id. Each id appears once. Order by id. Column name and type: id (integer).',
    starterSql: 'SELECT id\nFROM shipments;\n',
    referenceSql: "SELECT id FROM shipments WHERE status = 'queued' UNION SELECT shipment_id FROM invoices ORDER BY id;",
    wrongVariants: [
      { id: 'i1-all', mistake: 'UNION_DEDUPES', sql: "SELECT id FROM shipments WHERE status = 'queued' UNION ALL SELECT shipment_id FROM invoices ORDER BY id;", explanation: 'It looks like UNION ALL was used. A queued shipment that also has an invoice is listed twice. UNION lists each id once.' },
      { id: 'i1-except', mistake: 'SET_OPERATOR_CHOICE', sql: "SELECT id FROM shipments WHERE status = 'queued' EXCEPT SELECT shipment_id FROM invoices ORDER BY id;", explanation: 'It looks like EXCEPT was used. EXCEPT removes the billed shipments from the queued list, but the ticket also wants every billed shipment.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }],
    hints: [
      'Two lists are combined, and a shipment in both should appear once.',
      'UNION combines the two lists and removes repeats. The queued filter belongs to the first SELECT only.',
      "SELECT id FROM shipments WHERE status = 'queued'\nUNION\nSELECT shipment_id FROM invoices",
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c7-i2', chapterId: 7, role: 'independent', kind: 'write', title: 'Delivered and billed',
    ...ROUTES,
    summary: 'Find the shipments that were both scanned as delivered and billed, for the month-end check.',
    instructions: 'Return shipment_id for every shipment that has at least one shipment_events row with status delivered and at least one invoices row. Each shipment_id appears once. Order by shipment_id. Column name and type: shipment_id (integer).',
    starterSql: 'SELECT shipment_id\nFROM shipment_events;\n',
    referenceSql: "SELECT shipment_id FROM shipment_events WHERE status = 'delivered' INTERSECT SELECT shipment_id FROM invoices ORDER BY shipment_id;",
    wrongVariants: [
      { id: 'i2-except', mistake: 'SET_OPERATOR_CHOICE', sql: "SELECT shipment_id FROM shipment_events WHERE status = 'delivered' EXCEPT SELECT shipment_id FROM invoices ORDER BY shipment_id;", explanation: 'It looks like EXCEPT was used. EXCEPT returns the delivered scans with no invoice. The ticket asks for shipments that have both.' },
      { id: 'i2-union', mistake: 'SET_OPERATOR_CHOICE', sql: "SELECT shipment_id FROM shipment_events WHERE status = 'delivered' UNION SELECT shipment_id FROM invoices ORDER BY shipment_id;", explanation: 'It looks like UNION was used. UNION returns every delivered shipment and every billed one. INTERSECT keeps only the ids in both.' },
    ],
    ordered: true,
    columns: [{ name: 'shipment_id', type: 23 }],
    hints: [
      'The ticket wants ids that appear in both lists.',
      'INTERSECT keeps only the rows present in both queries, and it removes repeats.',
      "SELECT shipment_id FROM shipment_events WHERE status = 'delivered'\nINTERSECT\nSELECT shipment_id FROM invoices",
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
  {
    id: 'c7-i3', chapterId: 7, role: 'independent', kind: 'write', title: 'First ids from both tables, repeats kept',
    ...CUSTOMERS,
    summary: 'Build a reconciliation sample: the first three shipment ids and the first three invoice ids, one row each, even when they match.',
    instructions: 'Return id for the three lowest shipment ids and, separately, the three lowest invoice ids. Keep a row for each, even when an id appears in both lists. Order by id. Column name and type: id (integer).',
    starterSql: 'SELECT id\nFROM shipments;\n',
    referenceSql: 'SELECT id FROM (SELECT id FROM shipments ORDER BY id LIMIT 3) AS first_shipments UNION ALL SELECT id FROM (SELECT id FROM invoices ORDER BY id LIMIT 3) AS first_invoices ORDER BY id;',
    wrongVariants: [
      { id: 'i3-union', mistake: 'UNION_DEDUPES', sql: 'SELECT id FROM (SELECT id FROM shipments ORDER BY id LIMIT 3) AS first_shipments UNION SELECT id FROM (SELECT id FROM invoices ORDER BY id LIMIT 3) AS first_invoices ORDER BY id;', explanation: 'It looks like UNION was used. UNION removes the repeated ids, so an id that is both a shipment and an invoice appears once. The ticket keeps a row for each.' },
      { id: 'i3-desc', mistake: 'ORDER_DIRECTION', sql: 'SELECT id FROM (SELECT id FROM shipments ORDER BY id DESC LIMIT 3) AS first_shipments UNION ALL SELECT id FROM (SELECT id FROM invoices ORDER BY id DESC LIMIT 3) AS first_invoices ORDER BY id;', explanation: 'It looks like DESC was used. DESC takes the highest ids, not the lowest. The ticket asks for the first three, which are the lowest.' },
      { id: 'i3-limit-outside', mistake: 'SET_LIMIT_SCOPE', sql: 'SELECT id FROM shipments UNION ALL SELECT id FROM invoices ORDER BY id LIMIT 3;', explanation: 'It looks like the LIMIT was written after the whole combined query. It then keeps three rows in total, not three from each table. Each input needs its own LIMIT inside its own parentheses.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }],
    hints: [
      'Each side needs its own ORDER BY and LIMIT, so put each one in parentheses.',
      'Lowest ids come first in ascending order. UNION ALL keeps the repeated rows.',
      'SELECT id FROM (SELECT id FROM shipments ORDER BY id LIMIT 3) AS first_shipments\nUNION ALL\nSELECT id FROM (SELECT id FROM invoices ORDER BY id LIMIT 3) AS first_invoices',
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c7-i4', chapterId: 7, role: 'independent', kind: 'write', title: 'Statuses only the scans use',
    ...PIPELINE,
    summary: 'Find the scan statuses that never appear as a shipment status, so the dispatch vocabulary can be updated.',
    instructions: 'Return status for every value that appears in shipment_events.status but never in shipments.status. Each value appears once. Order by status. Column name and type: status (text).',
    starterSql: 'SELECT status\nFROM shipment_events;\n',
    referenceSql: 'SELECT status FROM shipment_events EXCEPT SELECT status FROM shipments ORDER BY status;',
    wrongVariants: [
      { id: 'i4-union', mistake: 'SET_OPERATOR_CHOICE', sql: 'SELECT status FROM shipment_events UNION SELECT status FROM shipments ORDER BY status;', explanation: 'It looks like UNION was used. UNION adds every shipment status as well, so the shared and shipment-only values appear. EXCEPT keeps only the scan-only values.' },
      { id: 'i4-intersect', mistake: 'SET_OPERATOR_CHOICE', sql: 'SELECT status FROM shipment_events INTERSECT SELECT status FROM shipments ORDER BY status;', explanation: 'It looks like INTERSECT was used. INTERSECT keeps the values in both feeds, which is the opposite of the ticket. EXCEPT keeps the scan-only values.' },
    ],
    ordered: true,
    columns: [{ name: 'status', type: 25 }],
    hints: [
      'The ticket wants values in the first list that are missing from the second.',
      'EXCEPT keeps the rows of the first query that the second query does not have.',
      'SELECT status FROM shipment_events EXCEPT SELECT status FROM shipments ORDER BY status;',
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
  {
    id: 'c7-b1-p1', chapterId: 7, role: 'boss', bossGroup: 'c7-boss', kind: 'write', title: 'Boss ticket, part 1: mismatched scans and invoices',
    ...DISPATCH,
    summary: 'Find the shipments that were scanned but not billed, or billed but never scanned. Part 1 of 2.',
    instructions: 'Part 1 of 2. Return shipment_id for each shipment that has a shipment_events row but no invoices row, or has an invoices row but no shipment_events row. Each shipment_id appears once. Order by shipment_id. Column name and type: shipment_id (integer).',
    starterSql: 'SELECT shipment_id\nFROM shipment_events;\n',
    referenceSql: '(SELECT shipment_id FROM shipment_events EXCEPT SELECT shipment_id FROM invoices) UNION (SELECT shipment_id FROM invoices EXCEPT SELECT shipment_id FROM shipment_events) ORDER BY shipment_id;',
    wrongVariants: [
      { id: 'b7p1-one-side', mistake: 'SET_OPERATOR_CHOICE', sql: 'SELECT shipment_id FROM shipment_events EXCEPT SELECT shipment_id FROM invoices ORDER BY shipment_id;', explanation: 'It looks like only one side was kept. The ticket asks for both kinds of mismatch, so the invoice-only shipments are missing.' },
      { id: 'b7p1-intersect', mistake: 'SET_OPERATOR_CHOICE', sql: 'SELECT shipment_id FROM shipment_events INTERSECT SELECT shipment_id FROM invoices ORDER BY shipment_id;', explanation: 'It looks like INTERSECT was used. INTERSECT returns the shipments that match on both sides, which is the opposite of a mismatch.' },
    ],
    ordered: true,
    columns: [{ name: 'shipment_id', type: 23 }],
    hints: [
      'Two one-sided differences, each with EXCEPT, combined with UNION.',
      'Read the query from left to right: EXCEPT and UNION have the same precedence, so parentheses make the grouping explicit.',
      '(SELECT shipment_id FROM shipment_events EXCEPT SELECT shipment_id FROM invoices)\nUNION\n(SELECT shipment_id FROM invoices EXCEPT SELECT shipment_id FROM shipment_events)',
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c7-b1-p2', chapterId: 7, role: 'boss', bossGroup: 'c7-boss', kind: 'write', title: 'Boss ticket, part 2: statuses in one feed only',
    ...ROUTES,
    summary: 'Find the status values that appear in exactly one of the two feeds. Part 2 of 2.',
    instructions: 'Part 2 of 2. Return status for each value that appears in shipments.status or in shipment_events.status, but not in both. Each value appears once. Sort from A to Z. Column name and type: status (text).',
    starterSql: 'SELECT status\nFROM shipments;\n',
    referenceSql: '(SELECT status FROM shipments UNION SELECT status FROM shipment_events) EXCEPT (SELECT status FROM shipments INTERSECT SELECT status FROM shipment_events) ORDER BY status;',
    wrongVariants: [
      { id: 'b7p2-intersect', mistake: 'SET_OPERATOR_CHOICE', sql: '(SELECT status FROM shipments UNION SELECT status FROM shipment_events) INTERSECT (SELECT status FROM shipments INTERSECT SELECT status FROM shipment_events) ORDER BY status;', explanation: 'It looks like INTERSECT was used for the last step. The result is the values in both feeds, which is the opposite of one feed only. EXCEPT removes them.' },
      { id: 'b7p2-desc', mistake: 'ORDER_DIRECTION', sql: '(SELECT status FROM shipments UNION SELECT status FROM shipment_events) EXCEPT (SELECT status FROM shipments INTERSECT SELECT status FROM shipment_events) ORDER BY status DESC;', explanation: 'It looks like the sort was reversed. The ticket sorts from A to Z, so the default ascending order is needed.' },
    ],
    ordered: true,
    columns: [{ name: 'status', type: 25 }],
    hints: [
      'Start with every status from either feed, then take away the values that both feeds share.',
      'INTERSECT binds more tightly than UNION or EXCEPT, so parentheses keep each step separate.',
      '(SELECT status FROM shipments UNION SELECT status FROM shipment_events)\nEXCEPT\n(SELECT status FROM shipments INTERSECT SELECT status FROM shipment_events)',
    ],
    docs: [{ label: 'PostgreSQL combining queries', url: SETOPS }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
];
