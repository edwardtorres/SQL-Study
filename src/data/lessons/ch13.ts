import type { Lesson } from '../../core/lesson';

// Chapter 13: Interview dispatch. Examples are read-only SELECTs on the sample. The timed interview mode comes later; these lessons teach the patterns the screens test.
export const lesson13: Lesson = {
  chapterId: 13,
  sections: [
    {
      id: 'c13-s1',
      title: 'Top-N per group and the second-highest value',
      paragraphs: [
        'A top-N question ranks rows inside each group, in descending order, and keeps the rows numbered 1 to N. ROW_NUMBER gives every row its own number, so exactly N rows survive for each group that has at least N rows, when the order is unique. RANK and DENSE_RANK give equal values the same number, so a filter on the number can keep more rows than the question asks for.',
        'The second-highest distinct value is the value with DENSE_RANK equal to 2 in descending order, because DENSE_RANK does not skip numbers after a tie. A second sort column makes the choice of rows reproducible when values tie.',
      ],
      example: 'SELECT customer_id, COUNT(*)::integer AS shipments\nFROM shipments\nGROUP BY customer_id\nORDER BY customer_id;',
      predict: {
        question: 'How many rows does this query return? It counts shipments for each customer.',
        options: [
          { id: 'a', text: 'Six, one for each customer with shipments' },
          { id: 'b', text: 'Eight, one for each customer in the table' },
          { id: 'c', text: 'Two hundred and forty, one for each shipment' },
        ],
        answer: 'a',
        answerRows: 6,
        explanation: 'Customers 7 and 8 have no shipments, so grouping shipments leaves them out. Six customers remain, and each group becomes one row.',
      },
      commonMistakes: [
        { mistake: 'RANK_VS_ROW_NUMBER', text: 'RANK gives tied rows the same number and skips the next one. A filter on that number keeps every tied row, so it can return more rows than the top N asked for.' },
        { mistake: 'SECOND_HIGHEST_RANK', text: 'The second-highest distinct value is rank 2 under DENSE_RANK, sorted from highest to lowest. Sorting from lowest to highest gives the second-lowest value instead.' },
      ],
      citations: ['pg-row-number', 'pg-rank-gaps', 'pg-dense-rank', 'pg-partition-by'],
      demonstrations: [
        { claim: 'Customers 7 and 8 have no shipments, so a group-by on shipments leaves them out.', sql: 'SELECT COUNT(*)::integer AS customers_without_shipments FROM customers WHERE id NOT IN (SELECT customer_id FROM shipments);' },
      ],
    },
    {
      id: 'c13-s2',
      title: 'Islands, gaps and running totals',
      paragraphs: [
        'Gaps-and-islands groups consecutive values. Within a run of consecutive ids, the id minus its row number stays the same, so that difference labels each island. A scan with no status breaks the run, and a repeated row shifts the row numbers, so remove the repeats and the scans with no status before numbering.',
        'A running total is a window that sums from the first row of its partition to the current row. Its frame is ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW. The default frame is RANGE, which takes in every row that ties with the current row.',
      ],
      example: 'SELECT DISTINCT id\nFROM staging_scans\nWHERE status IS NOT NULL AND id BETWEEN 1000 AND 1010\nORDER BY id;',
      predict: {
        question: 'How many rows does this query return? It lists the distinct scan ids in the range that have a status.',
        options: [
          { id: 'a', text: 'Nine, the distinct ids with a status' },
          { id: 'b', text: 'Ten, every id in the range that has a status' },
          { id: 'c', text: 'Eleven, one for each staged row in the range' },
        ],
        answer: 'a',
        answerRows: 9,
        explanation: 'Scan 1008 is not in the staging table, and scan 1005 has no status. Scan 1007 appears twice, so DISTINCT counts it once. That leaves nine ids.',
      },
      commonMistakes: [
        { mistake: 'STREAK_GAP_MISSED', text: 'A scan with no status is a gap in the feed. Keeping it joins the islands on either side, so two separate runs look like one long streak, and the gap that the ticket asks for is missed.' },
        { mistake: 'FRAME_DEFAULT', text: 'The default frame is RANGE, so rows that tie on the ORDER BY share one running total. Naming ROWS gives each row its own total, which is what a running total needs.' },
      ],
      citations: ['pg-rows-mode', 'pg-frame-default-meaning'],
      demonstrations: [
        { claim: 'Without DISTINCT the same range counts scan 1007 twice, so the count of rows with a status is larger than the count of ids.', sql: "SELECT COUNT(*)::integer AS rows_with_status FROM staging_scans WHERE status IS NOT NULL AND id BETWEEN 1000 AND 1010;" },
        { claim: 'The engine plans a window over customer partitions with a sort first. The plan is the engine’s own output.', sql: 'EXPLAIN SELECT customer_id, id, SUM(weight_kg) OVER (PARTITION BY customer_id ORDER BY booked_at, id) FROM shipments;', explain: true },
      ],
    },
    {
      id: 'c13-s3',
      title: 'Month-over-month, cohorts and pivots',
      paragraphs: [
        'Calendar months depend on the time zone. Cutting a timestamp with time zone to a month uses the session time zone unless the value is converted first, so AT TIME ZONE ‘UTC’ gives a plain timestamp in UTC and the month boundaries are UTC boundaries.',
        'A cohort is measured against the customers who started in that month, so each customer counts once, in the month of the first booking. A pivot turns one row per status into one column per status, and each SUM over a CASE needs an ELSE 0 (or a COALESCE around the sum), or a status with no shipments shows an empty cell instead of zero.',
      ],
      example: "SELECT to_char(date_trunc('month', booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, COUNT(*)::integer AS shipments\nFROM shipments\nGROUP BY 1\nORDER BY 1;",
      predict: {
        question: 'How many rows does this query return? It counts shipments in each UTC calendar month.',
        options: [
          { id: 'a', text: 'Two, December 2025 and January 2026' },
          { id: 'b', text: 'Twelve, one for each month of the year' },
          { id: 'c', text: 'Two hundred and forty, one for each shipment' },
        ],
        answer: 'a',
        answerRows: 2,
        explanation: 'The shipments are booked in late December 2025 and in January 2026, both in UTC, so grouping by UTC month gives two rows.',
      },
      commonMistakes: [
        { mistake: 'MONTH_BOUNDARY_TZ', text: 'A timestamp moved by a fixed offset before the month is cut lands in the wrong month near midnight. The shipment booked at midnight UTC on 1 January counts in December after an eight-hour shift.' },
        { mistake: 'PIVOT_CASE_ELSE', text: 'A CASE without an ELSE gives NULL for the other rows, and a SUM over only NULL values is NULL. A status with no shipments then shows an empty cell instead of 0.' },
      ],
      citations: ['pg-at-time-zone', 'pg-at-time-zone-out', 'pg-case-else-null'],
      demonstrations: [
        { claim: 'The shipment booked at midnight UTC on 1 January 2026 is in January in UTC. After an eight-hour shift it falls in December.', sql: "SELECT id, booked_at, to_char(date_trunc('month', booked_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS utc_month, to_char(date_trunc('month', booked_at - INTERVAL '8 hours'), 'YYYY-MM') AS shifted_month FROM shipments WHERE booked_at BETWEEN '2025-12-31T23:00:00Z' AND '2026-01-01T01:00:00Z' ORDER BY id;" },
      ],
    },
  ],
};
