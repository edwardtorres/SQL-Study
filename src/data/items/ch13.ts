import type { Challenge } from '../../core/types';
import { datasetsFor } from '../datasets';

const WINDOW = 'https://www.postgresql.org/docs/18/tutorial-window.html';
const AGG = 'https://www.postgresql.org/docs/18/tutorial-agg.html';
const DOCS_WINDOW = [{ label: 'PostgreSQL window functions', url: WINDOW }];
const DOCS_AGG = [{ label: 'PostgreSQL aggregate functions', url: AGG }];
const SCREEN = { colleague: 'Ravi Okafor', colleagueRole: 'Route planner' };
const REPORTING = { colleague: 'Tarin Wren', colleagueRole: 'Reporting analyst' };
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };

// Chapter 13: Interview dispatch. Entry-level screening problems on the Larkspur schema. Each item has an estimated solve time, in minutes.
export const chapter13Items: readonly Challenge[] = [
  {
    id: 'c13-g1', chapterId: 13, role: 'guided', starterStyle: 'blanks', title: 'The two heaviest shipments per customer', estimatedMinutes: 8,
    ...SCREEN,
    summary: 'For each customer, list the two heaviest shipments, using the shipment id to break ties.',
    instructions: 'For each customer, list the two shipments with the largest weight_kg. Shipments without a weight are left out. Equal weights are ordered by the smaller shipment id first. Columns: customer_id, id, weight_kg, ordered by customer_id, then by rank within the customer. The blank is the number of shipments to keep for each customer.',
    starterSql: 'WITH ranked AS (\n  SELECT id, customer_id, weight_kg,\n    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC, id) AS rn\n  FROM shipments\n  WHERE weight_kg IS NOT NULL\n)\nSELECT customer_id, id, weight_kg\nFROM ranked\nWHERE rn <= ____\nORDER BY customer_id, rn;',
    referenceSql: 'WITH ranked AS (\n  SELECT id, customer_id, weight_kg,\n    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC, id) AS rn\n  FROM shipments\n  WHERE weight_kg IS NOT NULL\n)\nSELECT customer_id, id, weight_kg\nFROM ranked\nWHERE rn <= 2\nORDER BY customer_id, rn;',
    columns: [{ name: 'customer_id', type: 23 }, { name: 'id', type: 23 }, { name: 'weight_kg', type: 23 }],
    wrongVariants: [
      { id: 'g1-no-tie-break', mistake: 'LATEST_TIE_BREAK', sql: 'WITH ranked AS (\n  SELECT id, customer_id, weight_kg,\n    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC) AS rn\n  FROM shipments\n  WHERE weight_kg IS NOT NULL\n)\nSELECT customer_id, id, weight_kg\nFROM ranked\nWHERE rn <= 2\nORDER BY customer_id, rn;', explanation: 'It looks like equal weights were not broken by id. When two shipments weigh the same, the row chosen can change from one run to the next, and the ticket asks for the smaller id first.' },
      { id: 'g1-strict', mistake: 'GE_VS_GT', sql: 'WITH ranked AS (\n  SELECT id, customer_id, weight_kg,\n    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC, id) AS rn\n  FROM shipments\n  WHERE weight_kg IS NOT NULL\n)\nSELECT customer_id, id, weight_kg\nFROM ranked\nWHERE rn < 2\nORDER BY customer_id, rn;', explanation: 'It looks like the filter kept rank below 2. That keeps one shipment per customer, and the ticket asks for two.' },
    ],
    ordered: true,
    hints: [
      'Rank the shipments inside each customer, heaviest first. Which window function gives every row its own rank?',
      'ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC, id) numbers each customer’s shipments. Keep the rows whose number is at most the count the ticket asks for.',
      'The blank is 2.',
    ],
    docs: DOCS_WINDOW,
    datasets: datasetsFor(['ties', 'boundary']),
  },
  {
    id: 'c13-i1', chapterId: 13, role: 'independent', starterStyle: 'skeleton', title: 'Islands of scans that carry a status', estimatedMinutes: 12,
    ...PIPELINE,
    summary: 'Find each run of consecutive scan ids that all carry a status, with the first id, the last id and the number of scans.',
    instructions: 'Scan ids run in order, and a scan with no status is a gap in the feed. Each run of consecutive ids that all have a status is one island. A scan id that the feed sent twice counts once. For each island, list its first id, its last id and the number of scans in it, ordered by the first id. Write the query only.',
    starterSql: 'SELECT id, status\nFROM staging_scans;\n',
    referenceSql: 'WITH ok AS (\n  SELECT DISTINCT id FROM staging_scans WHERE status IS NOT NULL\n),\ngrp AS (\n  SELECT id, id - ROW_NUMBER() OVER (ORDER BY id) AS island FROM ok\n)\nSELECT MIN(id) AS start_id, MAX(id) AS end_id, COUNT(*)::integer AS scans\nFROM grp\nGROUP BY island\nORDER BY start_id;',
    columns: [{ name: 'start_id', type: 23 }, { name: 'end_id', type: 23 }, { name: 'scans', type: 23 }],
    wrongVariants: [
      { id: 'i1-duplicates', mistake: 'DUPLICATE_DETECTION', sql: 'WITH ok AS (\n  SELECT id FROM staging_scans WHERE status IS NOT NULL\n),\ngrp AS (\n  SELECT id, id - ROW_NUMBER() OVER (ORDER BY id) AS island FROM ok\n)\nSELECT MIN(id) AS start_id, MAX(id) AS end_id, COUNT(*)::integer AS scans\nFROM grp\nGROUP BY island\nORDER BY start_id;', explanation: 'It looks like the repeated scan was not removed. Scan 1007 is counted twice, so the row numbers after it shift and an island is split or counted wrongly. Remove the repeats before numbering the ids.' },
      { id: 'i1-nulls-kept', mistake: 'STREAK_GAP_MISSED', sql: 'WITH ok AS (\n  SELECT DISTINCT id FROM staging_scans\n),\ngrp AS (\n  SELECT id, id - ROW_NUMBER() OVER (ORDER BY id) AS island FROM ok\n)\nSELECT MIN(id) AS start_id, MAX(id) AS end_id, COUNT(*)::integer AS scans\nFROM grp\nGROUP BY island\nORDER BY start_id;', explanation: 'It looks like scans with no status were kept. A scan with no status is a gap in the feed, but here it joins the islands on both sides, so the gap is missed.' },
    ],
    ordered: true,
    hints: [
      'Within a run of consecutive ids, id minus its row number stays the same. What makes that true, and which rows break it?',
      'Remove the repeated ids and the scans with no status first. Then number the remaining ids and group by id minus that number.',
      'Reference: WITH ok (distinct ids with a status), grp (id minus ROW_NUMBER), then group by that value.',
    ],
    docs: DOCS_WINDOW,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c13-i2', chapterId: 13, role: 'independent', starterStyle: 'skeleton', title: 'Bookings by month, with the change from the month before', estimatedMinutes: 10,
    ...REPORTING,
    summary: 'Count shipments booked in each calendar month, in UTC, and show how the count changed from the month before.',
    instructions: 'Count shipments by the calendar month they were booked in, using UTC for the month boundaries. For each month list the month as YYYY-MM, the shipment count, and the change from the previous month, ordered by month. The first month has no previous month, so its change is missing. Write the query only.',
    starterSql: 'SELECT id, booked_at\nFROM shipments;\n',
    referenceSql: "WITH monthly AS (\n  SELECT to_char(date_trunc('month', booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, COUNT(*)::integer AS shipments\n  FROM shipments\n  GROUP BY 1\n)\nSELECT month, shipments, (shipments - LAG(shipments) OVER (ORDER BY month))::integer AS change\nFROM monthly\nORDER BY month;",
    columns: [{ name: 'month', type: 25 }, { name: 'shipments', type: 23 }, { name: 'change', type: 23 }],
    wrongVariants: [
      { id: 'i2-offset', mistake: 'MONTH_BOUNDARY_TZ', sql: "WITH monthly AS (\n  SELECT to_char(date_trunc('month', booked_at - INTERVAL '8 hours'), 'YYYY-MM') AS month, COUNT(*)::integer AS shipments\n  FROM shipments\n  GROUP BY 1\n)\nSELECT month, shipments, (shipments - LAG(shipments) OVER (ORDER BY month))::integer AS change\nFROM monthly\nORDER BY month;", explanation: 'It looks like the timestamps were moved eight hours before the month was cut. A shipment booked at midnight UTC on 1 January then counts in December. The ticket counts calendar months in UTC.' },
      { id: 'i2-sign', mistake: 'DIRECTION_SWAPPED', sql: "WITH monthly AS (\n  SELECT to_char(date_trunc('month', booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, COUNT(*)::integer AS shipments\n  FROM shipments\n  GROUP BY 1\n)\nSELECT month, shipments, (LAG(shipments) OVER (ORDER BY month) - shipments)::integer AS change\nFROM monthly\nORDER BY month;", explanation: 'It looks like the change was taken as previous minus current. The sign is reversed, so a month that grew shows as a fall.' },
    ],
    ordered: true,
    hints: [
      'A change from the month before needs the previous row. Which window function reads the previous row?',
      'Group by the UTC month first, then use LAG over the months, and subtract it from the current count.',
      'Reference: a monthly CTE, then shipments - LAG(shipments) OVER (ORDER BY month).',
    ],
    docs: DOCS_WINDOW,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c13-i3', chapterId: 13, role: 'independent', starterStyle: 'skeleton', title: 'Retention of each booking cohort', estimatedMinutes: 12,
    ...REPORTING,
    summary: 'Group customers by the month of their first booking, and count how many of each group booked again the next month.',
    instructions: 'A customer’s cohort is the UTC month of their first shipment. For each cohort, list the cohort as YYYY-MM, the number of customers in the cohort, and how many of them booked a shipment in the following month. Count each customer once in their cohort. Order by cohort. Write the query only.',
    starterSql: 'SELECT customer_id, booked_at\nFROM shipments;\n',
    referenceSql: "WITH first_booking AS (\n  SELECT customer_id, MIN(date_trunc('month', booked_at AT TIME ZONE 'UTC')) AS cohort\n  FROM shipments\n  GROUP BY customer_id\n),\nactive AS (\n  SELECT DISTINCT customer_id, date_trunc('month', booked_at AT TIME ZONE 'UTC') AS month\n  FROM shipments\n)\nSELECT to_char(f.cohort, 'YYYY-MM') AS cohort, COUNT(*)::integer AS cohort_size, COUNT(a.customer_id)::integer AS retained\nFROM first_booking AS f\nLEFT JOIN active AS a ON a.customer_id = f.customer_id AND a.month = f.cohort + INTERVAL '1 month'\nGROUP BY f.cohort\nORDER BY f.cohort;",
    columns: [{ name: 'cohort', type: 25 }, { name: 'cohort_size', type: 23 }, { name: 'retained', type: 23 }],
    wrongVariants: [
      { id: 'i3-all-customers', mistake: 'COHORT_DENOMINATOR', sql: "WITH first_booking AS (\n  SELECT customer_id, MIN(date_trunc('month', booked_at AT TIME ZONE 'UTC')) AS cohort\n  FROM shipments\n  GROUP BY customer_id\n),\nactive AS (\n  SELECT DISTINCT customer_id, date_trunc('month', booked_at AT TIME ZONE 'UTC') AS month\n  FROM shipments\n)\nSELECT to_char(f.cohort, 'YYYY-MM') AS cohort, (SELECT COUNT(*) FROM customers)::integer AS cohort_size, COUNT(a.customer_id)::integer AS retained\nFROM first_booking AS f\nLEFT JOIN active AS a ON a.customer_id = f.customer_id AND a.month = f.cohort + INTERVAL '1 month'\nGROUP BY f.cohort\nORDER BY f.cohort;", explanation: 'It looks like the cohort size counted every customer in the customers table. The denominator of a retention rate is the cohort, the customers whose first booking fell in that month, so customers who never booked are not counted.' },
      { id: 'i3-fanout', mistake: 'JOIN_FANOUT', sql: "WITH first_booking AS (\n  SELECT customer_id, MIN(date_trunc('month', booked_at AT TIME ZONE 'UTC')) AS cohort\n  FROM shipments\n  GROUP BY customer_id\n),\nactive AS (\n  SELECT customer_id, date_trunc('month', booked_at AT TIME ZONE 'UTC') AS month\n  FROM shipments\n)\nSELECT to_char(f.cohort, 'YYYY-MM') AS cohort, COUNT(*)::integer AS cohort_size, COUNT(a.customer_id)::integer AS retained\nFROM first_booking AS f\nLEFT JOIN active AS a ON a.customer_id = f.customer_id AND a.month = f.cohort + INTERVAL '1 month'\nGROUP BY f.cohort\nORDER BY f.cohort;", explanation: 'It looks like the active customers were not made distinct. A customer who booked several times in the next month is counted once per shipment, so the retained count is too large.' },
    ],
    ordered: true,
    hints: [
      'A cohort is set by the first booking. Each customer belongs to one cohort, and is retained when a booking falls in the next month.',
      'Find each customer’s first UTC month, and the set of customer-month pairs with a booking. Join the two on the next month, then group by cohort.',
      'Reference: first_booking (MIN per customer), active (DISTINCT customer and month), LEFT JOIN on the next month, GROUP BY cohort.',
    ],
    docs: DOCS_AGG,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c13-i4', chapterId: 13, role: 'independent', starterStyle: 'skeleton', title: 'Status counts per route, one column per status', estimatedMinutes: 10,
    ...SCREEN,
    summary: 'Pivot the shipment statuses into one row per route, with a column for each status including returned.',
    instructions: 'For each route, count its shipments in each status, with one column per status: queued, in_transit, delivered, cancelled and returned. No shipment has the returned status yet, so that column shows 0, not a missing value. Order by route_id. Write the query only.',
    starterSql: 'SELECT route_id, status\nFROM shipments;\n',
    referenceSql: "SELECT route_id,\n  SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END)::integer AS queued,\n  SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END)::integer AS in_transit,\n  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::integer AS delivered,\n  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::integer AS cancelled,\n  SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END)::integer AS returned\nFROM shipments\nGROUP BY route_id\nORDER BY route_id;",
    columns: [{ name: 'route_id', type: 23 }, { name: 'queued', type: 23 }, { name: 'in_transit', type: 23 }, { name: 'delivered', type: 23 }, { name: 'cancelled', type: 23 }, { name: 'returned', type: 23 }],
    wrongVariants: [
      { id: 'i4-no-else', mistake: 'PIVOT_CASE_ELSE', sql: "SELECT route_id,\n  SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END)::integer AS queued,\n  SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END)::integer AS in_transit,\n  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::integer AS delivered,\n  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::integer AS cancelled,\n  SUM(CASE WHEN status = 'returned' THEN 1 END)::integer AS returned\nFROM shipments\nGROUP BY route_id\nORDER BY route_id;", explanation: 'It looks like the CASE has no ELSE 0 for returned. A SUM over only missing values is NULL, not 0, so the returned column is empty instead of showing zero.' },
      { id: 'i4-else-one', mistake: 'PIVOT_CASE_ELSE', sql: "SELECT route_id,\n  SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END)::integer AS queued,\n  SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END)::integer AS in_transit,\n  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::integer AS delivered,\n  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::integer AS cancelled,\n  SUM(CASE WHEN status = 'returned' THEN 1 ELSE 1 END)::integer AS returned\nFROM shipments\nGROUP BY route_id\nORDER BY route_id;", explanation: 'It looks like ELSE 1 was written in the returned column. Every shipment that is not returned then adds one to that column, so the count is wrong.' },
    ],
    ordered: true,
    hints: [
      'A pivot turns rows into columns with one conditional sum per column. What should a column show when no row matches its status?',
      'Use SUM(CASE WHEN status = ... THEN 1 ELSE 0 END) for each status, so an empty status sums to zero.',
      'Reference: one SUM(CASE ... ELSE 0 END) per status, grouped by route_id.',
    ],
    docs: DOCS_AGG,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c13-b1-p1', chapterId: 13, role: 'boss', bossGroup: 'c13-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 1: the latest event per shipment', estimatedMinutes: 12,
    ...SCREEN,
    summary: 'Keep one row per shipment: its newest event, with a tie in time going to the larger event id.',
    instructions: 'List one row for each shipment that has events: its shipment_id, the status and occurred_at of its newest event, and that event’s id as event_id. The newest event has the latest occurred_at. When two events share that time, the one with the larger id wins. Order by shipment_id. Write the query only.',
    starterSql: 'SELECT shipment_id, status\nFROM shipment_events;\n',
    referenceSql: 'SELECT DISTINCT ON (shipment_id) shipment_id, status, occurred_at, id AS event_id\nFROM shipment_events\nORDER BY shipment_id, occurred_at DESC, id DESC;',
    columns: [{ name: 'shipment_id', type: 23 }, { name: 'status', type: 25 }, { name: 'occurred_at', type: 1184 }, { name: 'event_id', type: 23 }],
    wrongVariants: [
      { id: 'b1p1-smaller-id', mistake: 'LATEST_TIE_BREAK', sql: 'SELECT DISTINCT ON (shipment_id) shipment_id, status, occurred_at, id AS event_id\nFROM shipment_events\nORDER BY shipment_id, occurred_at DESC, id ASC;', explanation: 'It looks like the tie was broken by the smaller id. Some shipments have two events at the newest time, and the ticket says the larger id is the newer event.' },
      { id: 'b1p1-largest-id', mistake: 'LATEST_VS_EARLIEST', sql: 'SELECT DISTINCT ON (shipment_id) shipment_id, status, occurred_at, id AS event_id\nFROM shipment_events\nORDER BY shipment_id, id DESC;', explanation: 'It looks like the largest id was taken as the newest event. Event ids are not in time order in this feed, so the event that arrived last is not always the event that happened last.' },
    ],
    ordered: true,
    hints: [
      'DISTINCT ON keeps the first row of each group, so the order inside each group decides the winner. Which columns order the events from newest to oldest?',
      'Sort by shipment_id, then occurred_at DESC, then id DESC, and DISTINCT ON (shipment_id) keeps the first row.',
      'Reference: SELECT DISTINCT ON (shipment_id) ... FROM shipment_events ORDER BY shipment_id, occurred_at DESC, id DESC.',
    ],
    docs: DOCS_AGG,
    datasets: datasetsFor(['ties', 'nulls']),
  },
  {
    id: 'c13-b1-p2', chapterId: 13, role: 'boss', bossGroup: 'c13-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 2: the second-highest weight per customer', estimatedMinutes: 10,
    ...PIPELINE,
    summary: 'For each customer, the second-highest distinct shipment weight, with no row for a customer who has only one distinct weight.',
    instructions: 'For each customer with at least two distinct shipment weights, list the customer_id and the second-highest distinct weight_kg. Shipments without a weight are left out. A weight shared by two shipments counts once. Order by customer_id. Write the query only.',
    starterSql: 'SELECT customer_id, weight_kg\nFROM shipments;\n',
    referenceSql: 'WITH ranked AS (\n  SELECT customer_id, weight_kg, DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC) AS rnk\n  FROM shipments\n  WHERE weight_kg IS NOT NULL\n)\nSELECT DISTINCT customer_id, weight_kg AS second_weight\nFROM ranked\nWHERE rnk = 2\nORDER BY customer_id;',
    columns: [{ name: 'customer_id', type: 23 }, { name: 'second_weight', type: 23 }],
    wrongVariants: [
      { id: 'b1p2-lowest', mistake: 'SECOND_HIGHEST_RANK', sql: 'WITH ranked AS (\n  SELECT customer_id, weight_kg, DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY weight_kg ASC) AS rnk\n  FROM shipments\n  WHERE weight_kg IS NOT NULL\n)\nSELECT DISTINCT customer_id, weight_kg AS second_weight\nFROM ranked\nWHERE rnk = 2\nORDER BY customer_id;', explanation: 'It looks like the weights were ordered ascending. Rank 2 is then the second-lightest weight, not the second-heaviest.' },
      { id: 'b1p2-highest', mistake: 'SECOND_HIGHEST_RANK', sql: 'WITH ranked AS (\n  SELECT customer_id, weight_kg, DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC) AS rnk\n  FROM shipments\n  WHERE weight_kg IS NOT NULL\n)\nSELECT DISTINCT customer_id, weight_kg AS second_weight\nFROM ranked\nWHERE rnk = 1\nORDER BY customer_id;', explanation: 'It looks like rank 1 was kept. That is the highest weight, and the ticket asks for the second-highest distinct weight.' },
    ],
    ordered: true,
    hints: [
      'Distinct weights are what the ticket counts, so rank the weights and skip repeated ones. Which rank function gives equal weights the same rank?',
      'DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY weight_kg DESC) gives 1 to the heaviest weight and 2 to the next distinct one.',
      'Reference: a DENSE_RANK CTE, then WHERE rnk = 2 with DISTINCT.',
    ],
    docs: DOCS_WINDOW,
    datasets: datasetsFor(['ties', 'boundary']),
  },
  {
    id: 'c13-b1-p3', chapterId: 13, role: 'boss', bossGroup: 'c13-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 3: a running weight total per customer', estimatedMinutes: 12,
    ...REPORTING,
    summary: 'For each shipment, the total weight the customer has booked so far, in booking order.',
    instructions: 'For each shipment with a weight, list the customer_id, the shipment id, and the running total of weight_kg for that customer up to and including this shipment, in booking order (booked_at, then id). Show the total as running_kg. Order by customer_id, booked_at, id. Write the query only.',
    starterSql: 'SELECT customer_id, id, weight_kg\nFROM shipments;\n',
    referenceSql: 'SELECT customer_id, id, SUM(weight_kg) OVER (PARTITION BY customer_id ORDER BY booked_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::integer AS running_kg\nFROM shipments\nWHERE weight_kg IS NOT NULL\nORDER BY customer_id, booked_at, id;',
    columns: [{ name: 'customer_id', type: 23 }, { name: 'id', type: 23 }, { name: 'running_kg', type: 23 }],
    wrongVariants: [
      { id: 'b1p3-two-rows', mistake: 'FRAME_OFF_BY_ONE', sql: 'SELECT customer_id, id, SUM(weight_kg) OVER (PARTITION BY customer_id ORDER BY booked_at, id ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)::integer AS running_kg\nFROM shipments\nWHERE weight_kg IS NOT NULL\nORDER BY customer_id, booked_at, id;', explanation: 'It looks like the frame was limited to the previous row and this one. The total then covers two shipments, not everything the customer has booked so far.' },
      { id: 'b1p3-no-partition', mistake: 'PARTITION_MISSING', sql: 'SELECT customer_id, id, SUM(weight_kg) OVER (ORDER BY booked_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::integer AS running_kg\nFROM shipments\nWHERE weight_kg IS NOT NULL\nORDER BY customer_id, booked_at, id;', explanation: 'It looks like the window has no PARTITION BY customer_id. The total then runs across every customer, not one customer at a time.' },
    ],
    ordered: true,
    hints: [
      'A running total is a window that starts at the first row of the customer and stops at the current row. Which frame says that?',
      'Partition by customer_id, order by booked_at and id, and use ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW.',
      'Reference: SUM(weight_kg) OVER (PARTITION BY customer_id ORDER BY booked_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW).',
    ],
    docs: DOCS_WINDOW,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
];
