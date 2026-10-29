import type { Challenge } from '../../core/types';
import { datasetsFor } from '../datasets';

// The interview reserve: ten problems for timed sets. They never appear in a chapter, in Daily Review or in Weak Spots,
// so a set is the only place a learner meets them. Each follows the same standards as a chapter ticket: a reference,
// a visible sample and two hidden datasets, wrong variants with tags and declared rules, three hints, and a bare starter.
// chapterId is the primary competency the problem scores toward. estimatedMinutes is the author's solve-time estimate.

const POSTGRES_SELECT = 'https://www.postgresql.org/docs/18/queries-select-lists.html';
const POSTGRES_JOINS = 'https://www.postgresql.org/docs/18/queries-table-expressions.html';
const POSTGRES_WINDOW = 'https://www.postgresql.org/docs/18/tutorial-window.html';
const POSTGRES_CONDITIONAL = 'https://www.postgresql.org/docs/18/functions-conditional.html';
const POSTGRES_UNION = 'https://www.postgresql.org/docs/18/queries-union.html';
const POSTGRES_CREATE_VIEW = 'https://www.postgresql.org/docs/18/sql-createview.html';
const POSTGRES_SUBQUERY = 'https://www.postgresql.org/docs/18/functions-subquery.html';
const POSTGRES_AGGREGATE = 'https://www.postgresql.org/docs/18/tutorial-agg.html';

const SCREEN = { colleague: 'Ravi Okafor', colleagueRole: 'Route planner' };
const CUSTOMERS = { colleague: 'Tamsin Rowe', colleagueRole: 'Customer success lead' };
const BILLING = { colleague: 'Pella Reed', colleagueRole: 'Billing analyst' };
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };

const INT = 23;
const TEXT = 25;
const NUMERIC = 1700;

export const interviewItems: readonly Challenge[] = [
  {
    id: 'int-01', chapterId: 4, role: 'independent', starterStyle: 'skeleton', title: 'Open shipments past due, per route', estimatedMinutes: 5,
    ...SCREEN,
    summary: 'Count the open shipments on each route that were due before 5 January.',
    instructions: 'For every route, count the shipments that are still open and were due before 5 January 2026. Columns: route_id, origin_city, late_shipments, ordered by route_id. Only queued and in-transit shipments count. A shipment due on 5 January is not late yet. A route with no late shipment still appears, with a count of zero.',
    starterSql: 'SELECT id AS route_id\nFROM routes;\n',
    referenceSql: "SELECT r.id AS route_id, w.city AS origin_city, COUNT(s.id)::integer AS late_shipments\nFROM routes r\nJOIN warehouses w ON w.id = r.origin_id\nLEFT JOIN shipments s\n  ON s.route_id = r.id\n AND s.status IN ('queued', 'in_transit')\n AND s.delivery_due < DATE '2026-01-05'\nGROUP BY r.id, w.city\nORDER BY r.id;",
    columns: [{ name: 'route_id', type: INT }, { name: 'origin_city', type: TEXT }, { name: 'late_shipments', type: INT }],
    wrongVariants: [
      { id: 'i01-where', rule: 'route-none-zero', mistake: 'LEFT_TO_INNER', sql: "SELECT r.id AS route_id, w.city AS origin_city, COUNT(s.id)::integer AS late_shipments\nFROM routes r\nJOIN warehouses w ON w.id = r.origin_id\nLEFT JOIN shipments s ON s.route_id = r.id\nWHERE s.status IN ('queued', 'in_transit') AND s.delivery_due < DATE '2026-01-05'\nGROUP BY r.id, w.city\nORDER BY r.id;", explanation: 'The late-shipment test sits in WHERE, so a route with no late shipment has no row left to count. Put the test in the join condition to keep the route with a count of zero.' },
      { id: 'i01-count-star', rule: 'route-none-zero', mistake: 'COUNT_STAR_VS_COL', sql: "SELECT r.id AS route_id, w.city AS origin_city, COUNT(*)::integer AS late_shipments\nFROM routes r\nJOIN warehouses w ON w.id = r.origin_id\nLEFT JOIN shipments s\n  ON s.route_id = r.id\n AND s.status IN ('queued', 'in_transit')\n AND s.delivery_due < DATE '2026-01-05'\nGROUP BY r.id, w.city\nORDER BY r.id;", explanation: 'COUNT(*) counts the empty outer-join row too, so a route with no late shipment shows 1. COUNT(s.id) counts only real shipments.' },
      { id: 'i01-due-inclusive', rule: 'due-not-late', mistake: 'GE_VS_GT', sql: "SELECT r.id AS route_id, w.city AS origin_city, COUNT(s.id)::integer AS late_shipments\nFROM routes r\nJOIN warehouses w ON w.id = r.origin_id\nLEFT JOIN shipments s\n  ON s.route_id = r.id\n AND s.status IN ('queued', 'in_transit')\n AND s.delivery_due <= DATE '2026-01-05'\nGROUP BY r.id, w.city\nORDER BY r.id;", explanation: 'The ticket says a shipment due on 5 January is not late yet. Using <= counts that day as late; the test is strictly before.' },
      { id: 'i01-no-status', rule: 'open-only', mistake: 'FILTER_MISSING', sql: "SELECT r.id AS route_id, w.city AS origin_city, COUNT(s.id)::integer AS late_shipments\nFROM routes r\nJOIN warehouses w ON w.id = r.origin_id\nLEFT JOIN shipments s\n  ON s.route_id = r.id\n AND s.delivery_due < DATE '2026-01-05'\nGROUP BY r.id, w.city\nORDER BY r.id;", explanation: 'Delivered and cancelled shipments are not open, so they are not late. The status test was left out, and those shipments are counted too.' },
    ],
    ordered: true,
    rules: [
      { id: 'open-only', text: 'Only queued and in-transit shipments count. Delivered and cancelled shipments do not.' },
      { id: 'due-not-late', text: 'A shipment due on 5 January 2026 is not late yet. Only earlier due dates count.' },
      { id: 'route-none-zero', text: 'A route with no late shipment still appears, with a count of zero.' },
    ],
    hints: [
      'Start from routes, so every route is in the answer before you count its late shipments.',
      'A LEFT JOIN keeps a route with no matching shipment. Where the late test goes decides whether that route survives.',
      'FROM routes r JOIN warehouses w ON w.id = r.origin_id LEFT JOIN shipments s ON s.route_id = r.id AND ... GROUP BY r.id, w.city.',
    ],
    docs: [{ label: 'PostgreSQL table expressions and joins', url: POSTGRES_JOINS }],
    datasets: datasetsFor(['boundary', 'ties']),
  },
  {
    id: 'int-02', chapterId: 5, role: 'independent', starterStyle: 'skeleton', title: 'Customers idle since 22 January', estimatedMinutes: 5,
    ...CUSTOMERS,
    summary: 'Find the customers who have not booked a shipment since 22 January 2026.',
    instructions: 'List the customers with no shipment booked on or after 22 January 2026 (UTC). A customer who has never booked a shipment is idle too. A booking on 22 January counts as recent. Only bookings on or after that cutoff count; earlier bookings do not make a customer active. Columns: id, name, ordered by id.',
    starterSql: 'SELECT id, name\nFROM customers;\n',
    referenceSql: "SELECT c.id, c.name\nFROM customers c\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM shipments s\n  WHERE s.customer_id = c.id\n    AND s.booked_at >= TIMESTAMPTZ '2026-01-22 00:00:00+00'\n)\nORDER BY c.id;",
    columns: [{ name: 'id', type: INT }, { name: 'name', type: TEXT }],
    wrongVariants: [
      { id: 'i02-never-booked', rule: 'never-booked-idle', mistake: 'LEFT_TO_INNER', sql: "SELECT c.id, c.name\nFROM customers c\nWHERE c.id IN (SELECT customer_id FROM shipments)\n  AND NOT EXISTS (\n    SELECT 1 FROM shipments s\n    WHERE s.customer_id = c.id\n      AND s.booked_at >= TIMESTAMPTZ '2026-01-22 00:00:00+00'\n  )\nORDER BY c.id;", explanation: 'Requiring a shipment to exist drops customers who have never booked. They are idle too, so they belong in the answer.' },
      { id: 'i02-any-time', rule: 'since-cutoff-only', mistake: 'FILTER_MISSING', sql: 'SELECT c.id, c.name\nFROM customers c\nWHERE NOT EXISTS (\n  SELECT 1 FROM shipments s WHERE s.customer_id = c.id\n)\nORDER BY c.id;', explanation: 'This keeps only customers who have never booked. A customer whose last booking was before the cutoff is idle too, and it is missing here.' },
    ],
    ordered: true,
    rules: [
      { id: 'never-booked-idle', text: 'A customer who has never booked a shipment is idle.' },
      { id: 'since-cutoff-only', text: 'Only bookings on or after 22 January count. Earlier bookings do not make a customer active.' },
    ],
    hints: [
      'A customer is idle when none of their shipments fall on or after the cutoff. That is a NOT EXISTS question.',
      'The correlated subquery should compare the shipment to the customer and to the cutoff, both at once.',
      'WHERE NOT EXISTS (SELECT 1 FROM shipments s WHERE s.customer_id = c.id AND s.booked_at >= TIMESTAMPTZ \'2026-01-22 00:00:00+00\').',
    ],
    docs: [{ label: 'PostgreSQL subquery expressions', url: POSTGRES_SUBQUERY }],
    datasets: datasetsFor(['boundary', 'nulltext']),
  },
  {
    id: 'int-03', chapterId: 3, role: 'independent', starterStyle: 'skeleton', title: 'First booking month and volume per customer', estimatedMinutes: 6,
    ...BILLING,
    summary: 'Show each customer’s first booking month and how many shipments they booked in that month.',
    instructions: 'For each customer with at least one shipment, show the UTC month (as YYYY-MM) of their first booking and the number of shipments they booked in that month. The first booking is the earliest booked_at of the customer. Columns: customer_id, first_month, shipments_in_month, ordered by customer_id. Customers with no shipment are left out.',
    starterSql: 'SELECT customer_id, id\nFROM shipments;\n',
    referenceSql: "WITH firsts AS (\n  SELECT customer_id, DATE_TRUNC('month', MIN(booked_at) AT TIME ZONE 'UTC') AS first_month\n  FROM shipments\n  GROUP BY customer_id\n)\nSELECT f.customer_id,\n  TO_CHAR(f.first_month, 'YYYY-MM') AS first_month,\n  COUNT(s.id)::integer AS shipments_in_month\nFROM firsts f\nJOIN shipments s\n  ON s.customer_id = f.customer_id\n AND DATE_TRUNC('month', s.booked_at AT TIME ZONE 'UTC') = f.first_month\nGROUP BY f.customer_id, f.first_month\nORDER BY f.customer_id;",
    columns: [{ name: 'customer_id', type: INT }, { name: 'first_month', type: TEXT }, { name: 'shipments_in_month', type: INT }],
    wrongVariants: [
      { id: 'i03-latest', rule: 'first-booking', mistake: 'AGGREGATE_CHOICE', sql: "WITH firsts AS (\n  SELECT customer_id, DATE_TRUNC('month', MAX(booked_at) AT TIME ZONE 'UTC') AS first_month\n  FROM shipments\n  GROUP BY customer_id\n)\nSELECT f.customer_id,\n  TO_CHAR(f.first_month, 'YYYY-MM') AS first_month,\n  COUNT(s.id)::integer AS shipments_in_month\nFROM firsts f\nJOIN shipments s\n  ON s.customer_id = f.customer_id\n AND DATE_TRUNC('month', s.booked_at AT TIME ZONE 'UTC') = f.first_month\nGROUP BY f.customer_id, f.first_month\nORDER BY f.customer_id;", explanation: 'MAX gives the latest booking, not the first. The month it picks is the last one a customer booked in.' },
      { id: 'i03-month-unmatched', mistake: 'JOIN_FANOUT', sql: "WITH firsts AS (\n  SELECT customer_id, DATE_TRUNC('month', MIN(booked_at) AT TIME ZONE 'UTC') AS first_month\n  FROM shipments\n  GROUP BY customer_id\n)\nSELECT f.customer_id,\n  TO_CHAR(f.first_month, 'YYYY-MM') AS first_month,\n  COUNT(s.id)::integer AS shipments_in_month\nFROM firsts f\nJOIN shipments s ON s.customer_id = f.customer_id\nGROUP BY f.customer_id, f.first_month\nORDER BY f.customer_id;", explanation: 'Without the month match, every shipment of the customer joins to the first-month row, so the count covers all months.' },
      { id: 'i03-customers-all', rule: 'at-least-one', mistake: 'NULL_NO_FALLBACK', sql: "WITH firsts AS (\n  SELECT customer_id, DATE_TRUNC('month', MIN(booked_at) AT TIME ZONE 'UTC') AS first_month\n  FROM shipments\n  GROUP BY customer_id\n)\nSELECT c.id AS customer_id,\n  TO_CHAR(f.first_month, 'YYYY-MM') AS first_month,\n  COUNT(s.id)::integer AS shipments_in_month\nFROM customers c\nLEFT JOIN firsts f ON f.customer_id = c.id\nLEFT JOIN shipments s\n  ON s.customer_id = c.id\n AND DATE_TRUNC('month', s.booked_at AT TIME ZONE 'UTC') = f.first_month\nGROUP BY c.id, f.first_month\nORDER BY c.id;", explanation: 'Starting from every customer keeps customers with no shipment, shown with an empty month and a count of zero. The ticket leaves them out.' },
      { id: 'i03-no-first-month', rule: 'first-booking', mistake: 'MISSING_GROUP_COL', sql: "SELECT customer_id,\n  TO_CHAR(DATE_TRUNC('month', booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS first_month,\n  COUNT(*)::integer AS shipments_in_month\nFROM shipments\nGROUP BY customer_id, first_month\nORDER BY customer_id;", explanation: 'This counts shipments in every month, not in each customer’s first month. The first booking is the earliest booked_at of the customer.' },
    ],
    ordered: true,
    rules: [
      { id: 'first-booking', text: 'The first booking is the earliest booked_at of the customer.' },
      { id: 'at-least-one', text: 'Only customers with at least one shipment appear. Customers with no shipment are left out.' },
    ],
    hints: [
      'Find each customer’s earliest booking first, then count their shipments in that month.',
      'Use a CTE or subquery that holds one row per customer with its first month, and join it back to the shipments.',
      'WITH firsts AS (SELECT customer_id, DATE_TRUNC(\'month\', MIN(booked_at) AT TIME ZONE \'UTC\') AS first_month FROM shipments GROUP BY customer_id).',
    ],
    docs: [{ label: 'PostgreSQL aggregate functions', url: POSTGRES_AGGREGATE }],
    datasets: datasetsFor(['ties', 'boundary']),
  },
  {
    id: 'int-04', chapterId: 4, role: 'independent', starterStyle: 'skeleton', title: 'Unbilled shipments by booking month', estimatedMinutes: 5,
    ...BILLING,
    summary: 'Count the shipments that have no invoice, grouped by the month they were booked.',
    instructions: 'For each UTC booking month that has unbilled shipments (shown as YYYY-MM), count the shipments that have no invoice. A shipment with an invoice is billed, whether or not the invoice is paid. Columns: booking_month, unbilled_shipments, ordered by booking_month.',
    starterSql: 'SELECT booked_at, id\nFROM shipments;\n',
    referenceSql: "SELECT TO_CHAR(DATE_TRUNC('month', s.booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS booking_month,\n  COUNT(*)::integer AS unbilled_shipments\nFROM shipments s\nLEFT JOIN invoices i ON i.shipment_id = s.id\nWHERE i.id IS NULL\nGROUP BY booking_month\nORDER BY booking_month;",
    columns: [{ name: 'booking_month', type: TEXT }, { name: 'unbilled_shipments', type: INT }],
    wrongVariants: [
      { id: 'i04-inner', rule: 'no-invoice-unbilled', mistake: 'LEFT_TO_INNER', sql: "SELECT TO_CHAR(DATE_TRUNC('month', s.booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS booking_month,\n  COUNT(*)::integer AS unbilled_shipments\nFROM shipments s\nJOIN invoices i ON i.shipment_id = s.id\nWHERE i.id IS NULL\nGROUP BY booking_month\nORDER BY booking_month;", explanation: 'An inner join keeps only shipments that have an invoice, so the missing-invoice test finds nothing.' },
      { id: 'i04-unpaid', rule: 'no-invoice-unbilled', mistake: 'NULL_AS_DEFAULT', sql: "SELECT TO_CHAR(DATE_TRUNC('month', s.booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS booking_month,\n  COUNT(*)::integer AS unbilled_shipments\nFROM shipments s\nLEFT JOIN invoices i ON i.shipment_id = s.id\nWHERE i.paid_at IS NULL\nGROUP BY booking_month\nORDER BY booking_month;", explanation: 'paid_at is empty for an unpaid invoice, which is still billed. Only a shipment with no invoice at all is unbilled.' },
    ],
    ordered: true,
    rules: [
      { id: 'no-invoice-unbilled', text: 'A shipment with no invoice is unbilled. A shipment with an invoice is billed, paid or not.' },
    ],
    hints: [
      'A shipment with no invoice is one a LEFT JOIN leaves without an invoice id.',
      'Keep the outer join, and test for the missing invoice after it.',
      'FROM shipments s LEFT JOIN invoices i ON i.shipment_id = s.id WHERE i.id IS NULL, grouped by the booking month.',
    ],
    docs: [{ label: 'PostgreSQL table expressions and joins', url: POSTGRES_JOINS }],
    datasets: datasetsFor(['nulls', 'empty']),
  },
  {
    id: 'int-05', chapterId: 8, role: 'independent', starterStyle: 'skeleton', title: 'Customers ranked by invoice count', estimatedMinutes: 6,
    ...BILLING,
    summary: 'Rank customers by how many invoices their shipments have, sharing a rank on equal counts.',
    instructions: 'Rank every customer with at least one invoice by the number of invoices on their shipments, most invoices first. Customers with equal counts share a rank, and the next rank has no gap. Columns: customer_id, billed_invoices, billed_rank, ordered by billed_rank, then customer_id. Customers with no invoice are left out.',
    starterSql: 'SELECT customer_id, id\nFROM shipments;\n',
    referenceSql: 'WITH counts AS (\n  SELECT s.customer_id, COUNT(i.id)::integer AS billed_invoices\n  FROM shipments s\n  JOIN invoices i ON i.shipment_id = s.id\n  GROUP BY s.customer_id\n)\nSELECT customer_id, billed_invoices,\n  DENSE_RANK() OVER (ORDER BY billed_invoices DESC)::integer AS billed_rank\nFROM counts\nORDER BY billed_rank, customer_id;',
    columns: [{ name: 'customer_id', type: INT }, { name: 'billed_invoices', type: INT }, { name: 'billed_rank', type: INT }],
    wrongVariants: [
      { id: 'i05-row-number', rule: 'equal-counts-share', mistake: 'RANK_VS_ROW_NUMBER', sql: 'WITH counts AS (\n  SELECT s.customer_id, COUNT(i.id)::integer AS billed_invoices\n  FROM shipments s\n  JOIN invoices i ON i.shipment_id = s.id\n  GROUP BY s.customer_id\n)\nSELECT customer_id, billed_invoices,\n  ROW_NUMBER() OVER (ORDER BY billed_invoices DESC)::integer AS billed_rank\nFROM counts\nORDER BY billed_rank, customer_id;', explanation: 'ROW_NUMBER gives every row its own number, so equal counts no longer share a rank.' },
      { id: 'i05-rank-gaps', rule: 'equal-counts-share', mistake: 'DENSE_VS_RANK', sql: 'WITH counts AS (\n  SELECT s.customer_id, COUNT(i.id)::integer AS billed_invoices\n  FROM shipments s\n  JOIN invoices i ON i.shipment_id = s.id\n  GROUP BY s.customer_id\n)\nSELECT customer_id, billed_invoices,\n  RANK() OVER (ORDER BY billed_invoices DESC)::integer AS billed_rank\nFROM counts\nORDER BY billed_rank, customer_id;', explanation: 'RANK skips the numbers after a tie, so the next rank has a gap. DENSE_RANK keeps the ranks in a row.' },
      { id: 'i05-zero-customers', rule: 'has-invoice', mistake: 'NULL_AS_DEFAULT', sql: 'WITH counts AS (\n  SELECT c.id AS customer_id, COUNT(i.id)::integer AS billed_invoices\n  FROM customers c\n  LEFT JOIN shipments s ON s.customer_id = c.id\n  LEFT JOIN invoices i ON i.shipment_id = s.id\n  GROUP BY c.id\n)\nSELECT customer_id, billed_invoices,\n  DENSE_RANK() OVER (ORDER BY billed_invoices DESC)::integer AS billed_rank\nFROM counts\nORDER BY billed_rank, customer_id;', explanation: 'Starting from every customer adds customers with no invoice, with a count of zero. The ticket leaves them out.' },
      { id: 'i05-lowest-first', rule: 'most-first', mistake: 'ORDER_DIRECTION', sql: 'WITH counts AS (\n  SELECT s.customer_id, COUNT(i.id)::integer AS billed_invoices\n  FROM shipments s\n  JOIN invoices i ON i.shipment_id = s.id\n  GROUP BY s.customer_id\n)\nSELECT customer_id, billed_invoices,\n  DENSE_RANK() OVER (ORDER BY billed_invoices ASC)::integer AS billed_rank\nFROM counts\nORDER BY billed_rank, customer_id;', explanation: 'Ascending order ranks the fewest invoices first. The ticket wants the most invoices at rank 1.' },
    ],
    ordered: true,
    rules: [
      { id: 'most-first', text: 'The customer with the most invoices has rank 1.' },
      { id: 'equal-counts-share', text: 'Customers with equal counts share a rank, and the next rank has no gap.' },
      { id: 'has-invoice', text: 'Only customers with at least one invoice appear. Customers with no invoice are left out.' },
    ],
    hints: [
      'Count invoices per customer in a CTE, then rank the counts with a window function.',
      'Pick the ranking function by what should happen on a tie: share the number and keep the next one consecutive.',
      'DENSE_RANK() OVER (ORDER BY billed_invoices DESC) ranks the counts; the ticket decides the direction and the tie rule.',
    ],
    docs: [{ label: 'PostgreSQL window functions', url: POSTGRES_WINDOW }],
    datasets: datasetsFor(['ties', 'precision']),
  },
  {
    id: 'int-06', chapterId: 8, role: 'independent', starterStyle: 'skeleton', title: 'Running weight per route', estimatedMinutes: 7,
    ...PIPELINE,
    summary: 'Show the running weight on each route, counting shipments in booking order.',
    instructions: 'For each shipment that has a weight, show the running total of weight_kg on its route, counting shipments in booking order (booked_at, then id). Each route keeps its own running total. Shipments with no weight are left out of the running total and of the output. The earliest shipment on a route starts its total at its own weight. Columns: id, route_id, running_kg, ordered by route_id, then booked_at, then id.',
    starterSql: 'SELECT id, route_id, weight_kg\nFROM shipments;\n',
    referenceSql: 'SELECT id, route_id,\n  (SUM(weight_kg) OVER (\n    PARTITION BY route_id\n    ORDER BY booked_at, id\n    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  ))::integer AS running_kg\nFROM shipments\nWHERE weight_kg IS NOT NULL\nORDER BY route_id, booked_at, id;',
    columns: [{ name: 'id', type: INT }, { name: 'route_id', type: INT }, { name: 'running_kg', type: INT }],
    wrongVariants: [
      { id: 'i06-no-partition', rule: 'per-route', mistake: 'PARTITION_MISSING', sql: 'SELECT id, route_id,\n  (SUM(weight_kg) OVER (\n    ORDER BY booked_at, id\n    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  ))::integer AS running_kg\nFROM shipments\nWHERE weight_kg IS NOT NULL\nORDER BY route_id, booked_at, id;', explanation: 'Without PARTITION BY the total runs across every route. Each route needs its own running total.' },
      { id: 'i06-null-zero', rule: 'weight-present', mistake: 'NULL_AS_DEFAULT', sql: 'SELECT id, route_id,\n  (SUM(COALESCE(weight_kg, 0)) OVER (\n    PARTITION BY route_id\n    ORDER BY booked_at, id\n    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  ))::integer AS running_kg\nFROM shipments\nORDER BY route_id, booked_at, id;', explanation: 'A shipment with no weight is left out of the output. Treating its missing weight as zero adds it as a row.' },
      { id: 'i06-descending', rule: 'booking-order', mistake: 'ORDER_DIRECTION', sql: 'SELECT id, route_id,\n  (SUM(weight_kg) OVER (\n    PARTITION BY route_id\n    ORDER BY booked_at DESC, id DESC\n    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  ))::integer AS running_kg\nFROM shipments\nWHERE weight_kg IS NOT NULL\nORDER BY route_id, booked_at, id;', explanation: 'Descending order starts the total from the latest shipment. The total counts in booking order, earliest first.' },
      { id: 'i06-one-short', rule: 'first-starts-total', mistake: 'FRAME_OFF_BY_ONE', sql: 'SELECT id, route_id,\n  (SUM(weight_kg) OVER (\n    PARTITION BY route_id\n    ORDER BY booked_at, id\n    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING\n  ))::integer AS running_kg\nFROM shipments\nWHERE weight_kg IS NOT NULL\nORDER BY route_id, booked_at, id;', explanation: 'The frame stops one row short of the current shipment. The earliest shipment on a route has no earlier row, so its total is empty, not its own weight.' },
    ],
    ordered: true,
    rules: [
      { id: 'weight-present', text: 'Shipments with no weight are left out of the running total and of the output.' },
      { id: 'per-route', text: 'Each route keeps its own running total.' },
      { id: 'booking-order', text: 'Shipments are counted in booking order: earliest booked_at first, then the smaller id.' },
      { id: 'first-starts-total', text: 'The earliest shipment on a route starts its total at its own weight.' },
    ],
    hints: [
      'A running total is a window sum that starts at the first row and ends at the current row.',
      'PARTITION BY restarts the total for each route, and ORDER BY sets the order it accumulates in.',
      'SUM(weight_kg) OVER (PARTITION BY route_id ORDER BY booked_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), with a WHERE that drops shipments with no weight.',
    ],
    docs: [{ label: 'PostgreSQL window functions', url: POSTGRES_WINDOW }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
  {
    id: 'int-07', chapterId: 8, role: 'independent', starterStyle: 'skeleton', title: 'Distinct staging scans per shipment', estimatedMinutes: 7,
    ...PIPELINE,
    summary: 'Count each shipment’s distinct staging scans, since the feed repeats some of them.',
    instructions: 'The staging feed repeats some scans. Count the distinct scans of each shipment, where two scans are the same when they have the same status and occurred_at. A scan with no status is not counted. A scan for a shipment that does not exist is not counted. A shipment with no scan left to count does not appear. Columns: shipment_id, distinct_scans, ordered by shipment_id.',
    starterSql: 'SELECT shipment_id, status\nFROM staging_scans;\n',
    referenceSql: 'SELECT d.shipment_id, COUNT(*)::integer AS distinct_scans\nFROM (\n  SELECT DISTINCT scan.shipment_id, scan.status, scan.occurred_at\n  FROM staging_scans scan\n  JOIN shipments s ON s.id = scan.shipment_id\n  WHERE scan.status IS NOT NULL\n) d\nGROUP BY d.shipment_id\nORDER BY d.shipment_id;',
    columns: [{ name: 'shipment_id', type: INT }, { name: 'distinct_scans', type: INT }],
    wrongVariants: [
      { id: 'i07-all-rows', rule: 'repeats-once', mistake: 'DISTINCT_MISUSE', sql: 'SELECT scan.shipment_id, COUNT(*)::integer AS distinct_scans\nFROM staging_scans scan\nJOIN shipments s ON s.id = scan.shipment_id\nWHERE scan.status IS NOT NULL\nGROUP BY scan.shipment_id\nORDER BY scan.shipment_id;', explanation: 'DISTINCT was left out, so a scan the feed repeated is counted once for each copy. Two scans that match on status and occurred_at count as one.' },
      { id: 'i07-null-counted', rule: 'no-status-not-counted', mistake: 'NULL_AS_DEFAULT', sql: 'SELECT d.shipment_id, COUNT(*)::integer AS distinct_scans\nFROM (\n  SELECT DISTINCT scan.shipment_id, scan.status, scan.occurred_at\n  FROM staging_scans scan\n  JOIN shipments s ON s.id = scan.shipment_id\n) d\nGROUP BY d.shipment_id\nORDER BY d.shipment_id;', explanation: 'A scan with no status is not counted. Without the status test, a scan that has no status is counted as a distinct scan.' },
      { id: 'i07-zero-rows', rule: 'no-counted-scan-left-out', mistake: 'NULL_NO_FALLBACK', sql: 'SELECT s.id AS shipment_id, COUNT(d.shipment_id)::integer AS distinct_scans\nFROM shipments s\nLEFT JOIN (\n  SELECT DISTINCT scan.shipment_id, scan.status, scan.occurred_at\n  FROM staging_scans scan\n  WHERE scan.status IS NOT NULL\n) d ON d.shipment_id = s.id\nGROUP BY s.id\nORDER BY s.id;', explanation: 'Starting from every shipment keeps shipments with no counted scan, shown with a count of zero. The ticket leaves them out.' },
      { id: 'i07-orphans', rule: 'unmatched-not-counted', mistake: 'JOIN_KEY', sql: 'SELECT d.shipment_id, COUNT(*)::integer AS distinct_scans\nFROM (\n  SELECT DISTINCT scan.shipment_id, scan.status, scan.occurred_at\n  FROM staging_scans scan\n  WHERE scan.status IS NOT NULL\n) d\nGROUP BY d.shipment_id\nORDER BY d.shipment_id;', explanation: 'Without the join to shipments, a scan for a shipment that does not exist is counted. The ticket leaves those scans out.' },
    ],
    ordered: true,
    rules: [
      { id: 'repeats-once', text: 'Two scans with the same status and occurred_at count once.' },
      { id: 'no-status-not-counted', text: 'A scan with no status is not counted.' },
      { id: 'unmatched-not-counted', text: 'A scan for a shipment that does not exist is not counted.' },
      { id: 'no-counted-scan-left-out', text: 'A shipment with no scan left to count does not appear.' },
    ],
    hints: [
      'Remove the repeats first, then count what is left for each shipment.',
      'SELECT DISTINCT in a subquery keeps one row for each combination of the columns you name.',
      'SELECT d.shipment_id, COUNT(*) FROM (SELECT DISTINCT scan.shipment_id, scan.status, scan.occurred_at FROM staging_scans scan JOIN shipments s ON s.id = scan.shipment_id WHERE scan.status IS NOT NULL) d GROUP BY d.shipment_id.',
    ],
    docs: [{ label: 'PostgreSQL SELECT, DISTINCT', url: POSTGRES_SELECT }],
    datasets: datasetsFor(['nulltext', 'boundary']),
  },
  {
    id: 'int-08', chapterId: 6, role: 'independent', starterStyle: 'skeleton', title: 'Route distance pivoted by destination', estimatedMinutes: 6,
    ...SCREEN,
    summary: 'Pivot each origin warehouse’s route distances into one row, with a column for each of two destinations.',
    instructions: 'For each warehouse that is the origin of at least one route, show the total distance_km of its routes to warehouse 1 and the total to warehouse 2, as separate columns. A warehouse with no route to warehouse 1 or to warehouse 2 shows zero in that column, not blank. Columns: origin_id, km_to_warehouse_1, km_to_warehouse_2, ordered by origin_id. Only warehouses that originate a route appear.',
    starterSql: 'SELECT origin_id, distance_km\nFROM routes;\n',
    referenceSql: 'SELECT origin_id,\n  COALESCE(SUM(CASE WHEN destination_id = 1 THEN distance_km END), 0)::integer AS km_to_warehouse_1,\n  COALESCE(SUM(CASE WHEN destination_id = 2 THEN distance_km END), 0)::integer AS km_to_warehouse_2\nFROM routes\nGROUP BY origin_id\nORDER BY origin_id;',
    columns: [{ name: 'origin_id', type: INT }, { name: 'km_to_warehouse_1', type: INT }, { name: 'km_to_warehouse_2', type: INT }],
    wrongVariants: [
      { id: 'i08-no-coalesce', rule: 'zero-not-blank', mistake: 'NULL_NO_FALLBACK', sql: 'SELECT origin_id,\n  SUM(CASE WHEN destination_id = 1 THEN distance_km END)::integer AS km_to_warehouse_1,\n  SUM(CASE WHEN destination_id = 2 THEN distance_km END)::integer AS km_to_warehouse_2\nFROM routes\nGROUP BY origin_id\nORDER BY origin_id;', explanation: 'A CASE with no matching route gives NULL, and SUM of only NULLs stays NULL. COALESCE turns that into zero.' },
      { id: 'i08-swapped', rule: 'origin-with-route', mistake: 'DIRECTION_SWAPPED', sql: 'SELECT destination_id AS origin_id,\n  COALESCE(SUM(CASE WHEN origin_id = 1 THEN distance_km END), 0)::integer AS km_to_warehouse_1,\n  COALESCE(SUM(CASE WHEN origin_id = 2 THEN distance_km END), 0)::integer AS km_to_warehouse_2\nFROM routes\nGROUP BY destination_id\nORDER BY origin_id;', explanation: 'Origin and destination are swapped. The ticket groups by where routes start, and only those warehouses appear.' },
    ],
    ordered: true,
    rules: [
      { id: 'origin-with-route', text: 'Only warehouses that originate at least one route appear.' },
      { id: 'zero-not-blank', text: 'A warehouse with no route to warehouse 1 or to warehouse 2 shows zero in that column, not blank.' },
    ],
    hints: [
      'Group the routes by their origin, then give each destination its own column.',
      'A CASE inside SUM sums only the rows that match. What should a sum with no matching row show?',
      'SELECT origin_id, COALESCE(SUM(CASE WHEN destination_id = 1 THEN distance_km END), 0) ... FROM routes GROUP BY origin_id.',
    ],
    docs: [{ label: 'PostgreSQL conditional expressions', url: POSTGRES_CONDITIONAL }],
    datasets: datasetsFor(['nulls', 'precision']),
  },
  {
    id: 'int-09', chapterId: 7, role: 'independent', starterStyle: 'skeleton', title: 'Queued shipments with no scan event', estimatedMinutes: 5,
    ...PIPELINE,
    summary: 'List the queued shipments that have no scan event at all.',
    instructions: 'List the id of every queued shipment that has no row in shipment_events. Only queued shipments count; in-transit, delivered and cancelled ones do not. A queued shipment with at least one event is left out. Columns: id, ordered by id.',
    starterSql: 'SELECT id\nFROM shipments;\n',
    referenceSql: "SELECT id FROM shipments WHERE status = 'queued'\nEXCEPT\nSELECT shipment_id FROM shipment_events\nORDER BY id;",
    columns: [{ name: 'id', type: INT }],
    wrongVariants: [
      { id: 'i09-union', rule: 'with-event-left-out', mistake: 'SET_OPERATOR_CHOICE', sql: "SELECT id FROM shipments WHERE status = 'queued'\nUNION\nSELECT shipment_id FROM shipment_events\nORDER BY id;", explanation: 'UNION adds the shipments that do have events, when the ticket wants them left out. EXCEPT removes them.' },
      { id: 'i09-no-queued-filter', rule: 'queued-only', mistake: 'FILTER_MISSING', sql: 'SELECT id FROM shipments\nEXCEPT\nSELECT shipment_id FROM shipment_events\nORDER BY id;', explanation: 'Without the queued test, in-transit, delivered and cancelled shipments with no events are listed too.' },
    ],
    ordered: true,
    rules: [
      { id: 'queued-only', text: 'Only queued shipments count; in-transit, delivered and cancelled ones do not.' },
      { id: 'with-event-left-out', text: 'A queued shipment with at least one event is left out.' },
    ],
    hints: [
      'Start with the set of queued shipments, then take away the shipments that appear in the events table.',
      'A set operator combines two queries. Which one removes the rows of the second query from the first?',
      'SELECT id FROM shipments WHERE status = \'queued\' EXCEPT SELECT shipment_id FROM shipment_events, then ORDER BY id.',
    ],
    docs: [{ label: 'PostgreSQL UNION, INTERSECT, EXCEPT', url: POSTGRES_UNION }],
    datasets: datasetsFor(['empty', 'nulls']),
  },
  {
    id: 'int-10', chapterId: 11, role: 'independent', starterStyle: 'skeleton', title: 'A view of billed shipments', estimatedMinutes: 6,
    ...CUSTOMERS,
    summary: 'Create a view that lists each invoice with its shipment and the customer who booked it.',
    instructions: 'Create a view named billed_shipments with one row for each invoice. Its columns are shipment_id, customer_id, customer_name and amount, where customer_id and customer_name come from the customer who booked the shipment. Create the view only; do not change any table.',
    starterSql: 'CREATE VIEW billed_shipments AS\nSELECT shipment_id, customer_id, customer_name, amount\nFROM invoices;\n',
    referenceSql: 'CREATE VIEW billed_shipments AS\nSELECT s.id AS shipment_id, c.id AS customer_id, c.name AS customer_name, i.amount\nFROM invoices i\nJOIN shipments s ON s.id = i.shipment_id\nJOIN customers c ON c.id = s.customer_id;',
    columns: [{ name: 'shipment_id', type: INT }, { name: 'customer_id', type: INT }, { name: 'customer_name', type: TEXT }, { name: 'amount', type: NUMERIC }],
    wrongVariants: [
      { id: 'i10-wrong-key', rule: 'customer-of-shipment', mistake: 'JOIN_KEY', sql: 'CREATE VIEW billed_shipments AS\nSELECT s.id AS shipment_id, c.id AS customer_id, c.name AS customer_name, i.amount\nFROM invoices i\nJOIN shipments s ON s.id = i.shipment_id\nJOIN customers c ON c.id = i.shipment_id;', explanation: 'The customer join uses the invoice’s shipment id as if it were a customer id. Join customers through the shipment’s customer_id.' },
      { id: 'i10-no-customer', rule: 'name-from-customer', mistake: 'JOIN_KEY', sql: 'CREATE VIEW billed_shipments AS\nSELECT s.id AS shipment_id, s.customer_id, i.amount\nFROM invoices i\nJOIN shipments s ON s.id = i.shipment_id;', explanation: 'The view has no customer_name column, so it does not match the columns the ticket names.' },
    ],
    policy: { allow: ['ViewStmt'] },
    checks: [{ id: 'billed-rows', label: 'Billed shipments', sql: 'SELECT shipment_id, customer_id, customer_name, amount FROM billed_shipments ORDER BY shipment_id' }],
    ordered: false,
    rules: [
      { id: 'customer-of-shipment', text: 'The customer on each row is the customer who booked that shipment.' },
      { id: 'name-from-customer', text: 'customer_name is the name from the customers table.' },
    ],
    hints: [
      'An invoice belongs to a shipment, and a shipment belongs to a customer. The view joins along that chain.',
      'Join shipments on the invoice’s shipment id, then join customers on the shipment’s customer_id.',
      'CREATE VIEW billed_shipments AS SELECT s.id AS shipment_id, c.id AS customer_id, c.name AS customer_name, i.amount FROM invoices i JOIN shipments s ON ... JOIN customers c ON ...;',
    ],
    docs: [{ label: 'PostgreSQL CREATE VIEW', url: POSTGRES_CREATE_VIEW }],
    datasets: datasetsFor(['precision', 'nulltext']),
  },
];
