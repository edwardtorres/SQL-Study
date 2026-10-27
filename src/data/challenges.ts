import type { Challenge } from '../core/types';
import { datasetsFor, sampleDataset } from './datasets';

export const companyName = 'Larkspur Freight';
// Kept for the Step 1 workspace: the visible sample plus the three original hidden edge cases.
export const datasets = datasetsFor(['nulls', 'ties', 'boundary']);

export const challenges: readonly Challenge[] = [
  {
    id: 'dispatch', chapterId: 1, role: 'sample', title: 'The heavy-load shortlist', kind: 'write',
    colleague: 'Nera Vale', colleagueRole: 'Dispatch coordinator',
    summary: 'Find the five heaviest queued shipments for the next dispatch board.',
    instructions: 'Use shipments. Return id, tracking_code, weight_kg, in that column order. Include only status = \'queued\' and weight_kg >= 500. Return at most 5 rows, ordered by weight_kg descending, then id ascending to break ties. Keep the original column names. Types: integer, text, integer. An empty result is valid when no shipments qualify.',
    lesson: 'SELECT chooses output columns; FROM chooses the table. WHERE keeps rows whose condition is TRUE. Combine conditions with AND. ORDER BY sets the order, DESC means largest first, and LIMIT caps the row count. Add a unique tie-breaker when a limited result needs to be predictable. The example reads a small shipment directory; edit it and run it before tackling the weight ticket.',
    exampleSql: 'SELECT id, tracking_code\nFROM shipments\nORDER BY id\nLIMIT 3;',
    guidedSql: "SELECT id, tracking_code, weight_kg\nFROM shipments\nWHERE status = '____' AND weight_kg >= ____\nORDER BY weight_kg ____, id ASC\nLIMIT ____;",
    starterSql: 'SELECT id, tracking_code, weight_kg\nFROM shipments;\n',
    referenceSql: "SELECT id, tracking_code, weight_kg FROM shipments WHERE status = 'queued' AND weight_kg >= 500 ORDER BY weight_kg DESC, id ASC LIMIT 5;",
    wrongVariants: [
      {
        id: 'boundary-excluded', mistake: 'GE_VS_GT',
        sql: "SELECT id, tracking_code, weight_kg FROM shipments WHERE status = 'queued' AND weight_kg > 500 ORDER BY weight_kg DESC, id ASC LIMIT 5;",
        explanation: 'It looks like the boundary value is excluded: check > versus >=. The ticket says exactly 500 kg still qualifies.',
      },
      {
        id: 'lightest-first', mistake: 'ORDER_DIRECTION',
        sql: "SELECT id, tracking_code, weight_kg FROM shipments WHERE status = 'queued' AND weight_kg >= 500 ORDER BY weight_kg ASC, id ASC LIMIT 5;",
        explanation: 'It looks like the sort direction is reversed: ASC returns the lightest rows first. The heaviest rows come first with DESC.',
      },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'tracking_code', type: 25 }, { name: 'weight_kg', type: 23 }],
    hints: [
      'Start with two filters: the shipment must be queued, and exactly 500 kg still qualifies.',
      'Use AND to combine the conditions. Sort weight descending and id ascending before applying the five-row limit.',
      "WHERE status = 'queued' AND weight_kg >= 500\nORDER BY weight_kg DESC, id ASC\n-- Add the required LIMIT.",
    ],
    docs: [
      { label: 'PostgreSQL SELECT tutorial', url: 'https://www.postgresql.org/docs/18/tutorial-select.html' },
      { label: 'PostgreSQL LIMIT and OFFSET', url: 'https://www.postgresql.org/docs/18/queries-limit.html' },
      { label: 'PostgreSQL ORDER BY and DESC', url: 'https://www.postgresql.org/docs/18/queries-order.html' },
    ],
    datasets: datasetsFor(['nulls', 'ties', 'boundary']),
  },
  {
    id: 'unbilled', chapterId: 3, role: 'sample', title: 'The phantom unbilled shipment', kind: 'fix',
    colleague: 'Pella Reed', colleagueRole: 'Billing analyst',
    summary: 'A billing dashboard reports unbilled shipments for customers who have never shipped anything.',
    instructions: 'Repair the supplied query. Return one row for every customer, including customers with no shipments. A shipment is unbilled when no invoices row references it. Return customer_id (integer), customer_name (text), unbilled_shipments (integer), in that column order. A customer with no shipments must have 0. Sort by customer_id ascending. Count real shipments, not the placeholder row made by a LEFT JOIN.',
    lesson: 'A LEFT JOIN preserves the row on its left even when no matching row exists; the right-hand columns are then NULL. COUNT(*) counts that placeholder row. COUNT(column) counts only rows whose chosen value is not NULL. FILTER restricts which rows enter an aggregate. The worked example compares counts on a simple customer-to-shipment join without calculating unbilled shipments.',
    exampleSql: 'SELECT c.id AS customer_id, COUNT(*)::integer AS joined_rows,\n       COUNT(s.id)::integer AS real_shipments\nFROM customers c\nLEFT JOIN shipments s ON s.customer_id = c.id\nGROUP BY c.id\nORDER BY c.id;',
    starterSql: 'SELECT c.id AS customer_id, c.name AS customer_name,\n       COUNT(*) FILTER (WHERE i.id IS NULL)::integer AS unbilled_shipments\nFROM customers c\nLEFT JOIN shipments s ON s.customer_id = c.id\nLEFT JOIN invoices i ON i.shipment_id = s.id\nGROUP BY c.id, c.name\nORDER BY c.id;',
    referenceSql: 'SELECT c.id AS customer_id, c.name AS customer_name, COUNT(s.id) FILTER (WHERE i.id IS NULL)::integer AS unbilled_shipments FROM customers c LEFT JOIN shipments s ON s.customer_id = c.id LEFT JOIN invoices i ON i.shipment_id = s.id GROUP BY c.id, c.name ORDER BY c.id;',
    wrongVariants: [
      {
        id: 'count-placeholder', mistake: 'COUNT_STAR_VS_COL',
        sql: 'SELECT c.id AS customer_id, c.name AS customer_name, COUNT(*) FILTER (WHERE i.id IS NULL)::integer AS unbilled_shipments FROM customers c LEFT JOIN shipments s ON s.customer_id = c.id LEFT JOIN invoices i ON i.shipment_id = s.id GROUP BY c.id, c.name ORDER BY c.id;',
        explanation: 'It looks like COUNT(*) is counting the LEFT JOIN placeholder row. Customers with no shipments show 1 instead of 0. COUNT(s.id) counts only real shipments.',
      },
      {
        id: 'where-turns-inner', mistake: 'LEFT_TO_INNER',
        sql: 'SELECT c.id AS customer_id, c.name AS customer_name, COUNT(s.id) FILTER (WHERE i.id IS NULL)::integer AS unbilled_shipments FROM customers c LEFT JOIN shipments s ON s.customer_id = c.id LEFT JOIN invoices i ON i.shipment_id = s.id WHERE s.customer_id IS NOT NULL GROUP BY c.id, c.name ORDER BY c.id;',
        explanation: 'It looks like a WHERE filter turned the LEFT JOIN into an inner join. Customers with no shipments disappear, but the ticket needs every customer, including those with 0.',
      },
    ],
    ordered: true,
    columns: [{ name: 'customer_id', type: 23 }, { name: 'customer_name', type: 25 }, { name: 'unbilled_shipments', type: 23 }],
    hints: [
      'Inspect a customer with no shipments. Which value on the shipment side is NULL?',
      'Keep the LEFT JOINs and the invoice filter. Change what COUNT counts so the preserved customer-only row contributes zero.',
      'COUNT(s.id) FILTER (WHERE i.id IS NULL)::integer AS unbilled_shipments',
    ],
    docs: [
      { label: 'PostgreSQL aggregate functions', url: 'https://www.postgresql.org/docs/18/functions-aggregate.html' },
      { label: 'PostgreSQL joins', url: 'https://www.postgresql.org/docs/18/queries-table-expressions.html' },
      { label: 'PostgreSQL aggregate FILTER syntax', url: 'https://www.postgresql.org/docs/18/sql-expressions.html#SYNTAX-AGGREGATES' },
    ],
    datasets: datasetsFor(['nulls', 'ties', 'boundary']),
  },
  {
    id: 'latest-event', chapterId: 8, role: 'sample', title: 'One reliable latest scan', kind: 'window',
    colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer',
    summary: 'Build a latest-event feed that stays deterministic when two scans share a timestamp.',
    instructions: 'Use a window function. Return one row for each shipment that has at least one shipment_events row; exclude shipments with no events. Latest means greatest occurred_at. If timestamps tie, choose the greatest event id. Return shipment_id (integer), event_id (integer), status (text), occurred_at (timestamptz), in that column order. Sort the final result by shipment_id ascending. Column aliases and types must match. Event insertion order is not chronological.',
    lesson: 'Window functions calculate values across related rows without collapsing them into a single group. PARTITION BY starts a separate calculation for each group; the window ORDER BY controls the calculation inside it. ROW_NUMBER can select one row per group; a complete tie-breaker makes the chosen row deterministic. An outer query filters a computed row number. The example ranks shipment weights; it does not solve the event-selection ticket.',
    exampleSql: 'SELECT id, customer_id, weight_kg,\n       RANK() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC NULLS LAST) AS weight_rank\nFROM shipments\nORDER BY customer_id, weight_rank, id\nLIMIT 10;',
    starterSql: 'SELECT shipment_id, id AS event_id, status, occurred_at\nFROM shipment_events;\n',
    referenceSql: 'WITH ranked AS (SELECT shipment_id, id AS event_id, status, occurred_at, ROW_NUMBER() OVER (PARTITION BY shipment_id ORDER BY occurred_at DESC, id DESC) AS position FROM shipment_events) SELECT shipment_id, event_id, status, occurred_at FROM ranked WHERE position = 1 ORDER BY shipment_id;',
    wrongVariants: [
      {
        id: 'id-tiebreak-ascending', mistake: 'TIE_NONDETERMINISTIC',
        sql: 'WITH ranked AS (SELECT shipment_id, id AS event_id, status, occurred_at, ROW_NUMBER() OVER (PARTITION BY shipment_id ORDER BY occurred_at DESC, id ASC) AS position FROM shipment_events) SELECT shipment_id, event_id, status, occurred_at FROM ranked WHERE position = 1 ORDER BY shipment_id;',
        explanation: 'It looks like the tie-breaker runs the wrong way. When two scans share a timestamp, the ticket keeps the greatest event id, so id must be DESC.',
      },
      {
        id: 'earliest-event', mistake: 'ORDER_DIRECTION',
        sql: 'WITH ranked AS (SELECT shipment_id, id AS event_id, status, occurred_at, ROW_NUMBER() OVER (PARTITION BY shipment_id ORDER BY occurred_at ASC, id DESC) AS position FROM shipment_events) SELECT shipment_id, event_id, status, occurred_at FROM ranked WHERE position = 1 ORDER BY shipment_id;',
        explanation: 'It looks like the timestamp order is reversed, so the earliest scan wins. Latest means the greatest occurred_at, which needs DESC.',
      },
    ],
    ordered: true,
    structure: 'window',
    columns: [{ name: 'shipment_id', type: 23 }, { name: 'event_id', type: 23 }, { name: 'status', type: 25 }, { name: 'occurred_at', type: 1184 }],
    hints: [
      'Two events can have the same occurred_at. A timestamp alone does not identify the winning event.',
      'Partition by shipment_id, sort both the timestamp and the event ID descending, then keep row number 1.',
      'ROW_NUMBER() OVER (\n  PARTITION BY shipment_id\n  ORDER BY occurred_at DESC, id DESC\n)',
    ],
    docs: [
      { label: 'PostgreSQL window tutorial', url: 'https://www.postgresql.org/docs/18/tutorial-window.html' },
      { label: 'PostgreSQL window functions', url: 'https://www.postgresql.org/docs/18/functions-window.html' },
    ],
    datasets: datasetsFor(['nulls', 'ties', 'boundary']),
  },
];

export { sampleDataset };
