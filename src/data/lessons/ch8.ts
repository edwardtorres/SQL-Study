import type { Lesson } from '../../core/lesson';

// Chapter 8: Rank and compare. Examples run on the visible sample; answerRows is the engine's row count.
export const lesson8: Lesson = {
  chapterId: 8,
  sections: [
    {
      id: 'c8-s1',
      title: 'Numbering, ranking and ties',
      paragraphs: [
        'A window function computes a value for each row from a set of related rows, and every input row stays in the output. OVER says which rows are related: PARTITION BY starts a separate calculation for each group, and ORDER BY sets the order inside it.',
        'ROW_NUMBER gives each row its own number, and the order of tied rows is not defined. RANK gives tied rows the same number and then skips ahead. DENSE_RANK gives tied rows the same number with no gap after them.',
      ],
      example: 'SELECT customer_id, id, delivery_due,\n       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY delivery_due, id) AS row_no,\n       RANK() OVER (PARTITION BY customer_id ORDER BY delivery_due) AS due_rank,\n       DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY delivery_due) AS dense_rank\nFROM shipments\nWHERE customer_id = 1\nORDER BY delivery_due, id;',
      predict: {
        question: 'How many rows will this query return? It filters to one customer, and the window functions only add columns.',
        options: [
          { id: 'a', text: 'Forty rows, one for each of the customer’s shipments' },
          { id: 'b', text: 'About a dozen, one for each distinct due date' },
          { id: 'c', text: 'One row, because the three functions share one partition' },
        ],
        answer: 'a',
        answerRows: 40,
        explanation: 'Window functions do not collapse rows. Each shipment stays a row, and the ranks are extra columns. The three functions differ only in how they number shipments that share a due date.',
      },
      commonMistakes: [
        { mistake: 'TIE_NONDETERMINISTIC', text: 'ROW_NUMBER leaves the order of tied rows undefined. Add a unique column, such as id, to the window ORDER BY when the ticket needs one row per position.' },
        { mistake: 'RANK_VS_ROW_NUMBER', text: 'RANK gives tied rows the same number. ROW_NUMBER gives each row its own. Choose RANK when ties should share a position, and ROW_NUMBER when exactly one row takes each position.' },
        { mistake: 'DENSE_VS_RANK', text: 'After a tie, RANK skips numbers and DENSE_RANK does not. Two tied rows at the top make RANK continue at 3; DENSE_RANK continues at 2.' },
      ],
      citations: ['pg-peers', 'pg-row-number', 'pg-row-number-ties', 'pg-rank-gaps', 'pg-dense-rank'],
      demonstrations: [
        { claim: 'After two tied rows, RANK continues at 3, while DENSE_RANK continues at 2.', sql: 'SELECT v, RANK() OVER (ORDER BY v) AS rnk, DENSE_RANK() OVER (ORDER BY v) AS dense FROM (VALUES (10), (10), (20)) AS t(v) ORDER BY v;' },
      ],
    },
    {
      id: 'c8-s2',
      title: 'LAG, LEAD and running totals',
      paragraphs: [
        'LAG reads a value from an earlier row in the same partition, and LEAD reads one from a later row. When no such row exists, the default is NULL, so the first row of LAG and the last row of LEAD have no value.',
        'A frame says which rows of the partition a window function uses. With ORDER BY and no frame, the default frame runs from the start of the partition through the current row’s last peer. A ROWS frame counts rows one at a time, so tied rows can get different totals.',
      ],
      example: 'SELECT shipment_id, status, occurred_at,\n       LAG(status) OVER (PARTITION BY shipment_id ORDER BY occurred_at, id) AS previous_status\nFROM shipment_events\nWHERE shipment_id = 2\nORDER BY occurred_at, id;',
      predict: {
        question: 'How many rows will this query return, and what does previous_status show on the first row?',
        options: [
          { id: 'a', text: 'Two rows, because the first scan has no previous status to show' },
          { id: 'b', text: 'Three rows, and the first row shows NULL for previous_status' },
          { id: 'c', text: 'Three rows, and the first row repeats its own status' },
        ],
        answer: 'b',
        answerRows: 3,
        explanation: 'Every scan of the shipment stays in the result. LAG has no earlier scan for the first row, so previous_status is NULL there.',
      },
      commonMistakes: [
        { mistake: 'LAG_NULL_FIRST', text: 'The first row of LAG and the last row of LEAD are NULL unless a default is given. A comparison with NULL is not true, so filters on the window value need an explicit NULL test.' },
        { mistake: 'FRAME_DEFAULT', text: 'With ORDER BY and no frame, the default frame sums or counts every row up to the current row’s last peer. A running total therefore includes tied rows together.' },
        { mistake: 'FRAME_OFF_BY_ONE', text: '2 PRECEDING reaches back two rows, so the frame holds three rows including the current one. Count the current row when you write the offset.' },
      ],
      citations: ['pg-lag', 'pg-lag-default', 'pg-lead', 'pg-frame-default', 'pg-frame-default-meaning', 'pg-whole-partition', 'pg-rows-mode'],
      demonstrations: [
        { claim: 'With ORDER BY, the default frame includes every tied peer, so two rows with the same value show the same running total. A ROWS frame gives each row its own total.', sql: 'SELECT v, SUM(v) OVER (ORDER BY v) AS default_frame, SUM(v) OVER (ORDER BY v ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rows_frame FROM (VALUES (1), (1), (2)) AS t(v) ORDER BY v, rows_frame;' },
      ],
    },
    {
      id: 'c8-s3',
      title: 'Top rows per group and removing repeats',
      paragraphs: [
        'Window functions are permitted only in the SELECT list and the ORDER BY clause, so a top-N filter needs a subquery or a WITH clause. Compute the row number there, then filter it in the outer query.',
        'Keeping one row per group uses the same pattern: number the rows within each group, with a tie-breaker, and keep position 1. The partition decides what counts as one group, so it must match the rule the ticket describes.',
      ],
      example: 'WITH ranked AS (\n  SELECT shipment_id, id, status, occurred_at,\n         ROW_NUMBER() OVER (PARTITION BY shipment_id ORDER BY occurred_at DESC, id DESC) AS position\n  FROM shipment_events\n)\nSELECT shipment_id, id, status, occurred_at\nFROM ranked\nWHERE position = 1\nORDER BY shipment_id;',
      predict: {
        question: 'How many rows will this query return? It keeps the newest scan of each shipment.',
        options: [
          { id: 'a', text: 'One row for each shipment event, 678 rows' },
          { id: 'b', text: 'One row for each shipment that has at least one event, 218 rows' },
          { id: 'c', text: 'One row for each shipment, 240 rows, including shipments with no events' },
        ],
        answer: 'b',
        answerRows: 218,
        explanation: 'The window keeps one row per shipment that has events. Shipments with no events have no rows to number, so they are not in the result.',
      },
      commonMistakes: [
        { mistake: 'PARTITION_MISSING', text: 'Without PARTITION BY, the whole table is one group, and position 1 is a single row. Name the column that defines a group in the PARTITION BY.' },
        { mistake: 'TIE_NONDETERMINISTIC', text: 'If two rows in a group tie on the ORDER BY, the kept row is not defined. Add a unique tie-breaker, such as id, so the same row is kept every time.' },
      ],
      citations: ['pg-partition-by', 'pg-window-where'],
    },
  ],
};
