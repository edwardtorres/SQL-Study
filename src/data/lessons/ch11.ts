import type { Lesson } from '../../core/lesson';

// Chapter 11: Repair the pipeline. Examples are read-only SELECTs on the visible sample; the load tickets run in a rolled-back copy and may run twice.
export const lesson11: Lesson = {
  chapterId: 11,
  sections: [
    {
      id: 'c11-s1',
      title: 'Upserts: insert the new rows, update the ones that exist',
      paragraphs: [
        'An upsert inserts a row, and when a row with the same key already exists, it updates that row instead of failing. In PostgreSQL the form is INSERT with ON CONFLICT naming the key, then DO UPDATE.',
        'An upsert sets the values it is given, so running it again gives the same result. A plain insert adds the rows again and fails on the key, so a load that must be safe to run twice uses an upsert.',
      ],
      example: 'SELECT customer_id, region, changed_at\nFROM staging_customer_regions\nWHERE customer_id IN (2, 4, 6)\nORDER BY customer_id, changed_at;',
      predict: {
        question: 'How many rows does this query return? It reads the feed’s region changes for customers 2, 4 and 6.',
        options: [
          { id: 'a', text: 'Four rows: two changes for customer 2, one for customer 4 and one for customer 6' },
          { id: 'b', text: 'Three rows, one for each customer' },
          { id: 'c', text: 'Five rows, including the change for customer 99' },
        ],
        answer: 'a',
        answerRows: 4,
        explanation: 'The feed sends two region changes for customer 2, and one each for customers 4 and 6. Customer 99 is not in the filter. An upsert that sees two rows for the same key must pick one of them.',
      },
      commonMistakes: [
        { mistake: 'UPSERT_DUPLICATE_ON_RERUN', text: 'A plain insert has no conflict clause. The first run works, but a second run inserts the same keys again, and the primary key rejects them. An upsert updates the row that already exists.' },
        { mistake: 'LATEST_VS_EARLIEST', text: 'When several changes share a key, the order decides which one the upsert keeps. Sort by time descending inside each key to keep the newest change.' },
      ],
      citations: ['pg-insert-upsert'],
      demonstrations: [
        { claim: 'The feed sends customer 2 two changes, so one statement can see two rows for the same key.', sql: 'SELECT customer_id, COUNT(*)::integer AS changes FROM staging_customer_regions GROUP BY customer_id HAVING COUNT(*) > 1 ORDER BY customer_id;' },
      ],
    },
    {
      id: 'c11-s2',
      title: 'MERGE: match, update, insert and delete in one statement',
      paragraphs: [
        'MERGE compares a source with a target. Each source row either matches a target row or does not, and the WHEN clauses say what to do in each case: update the matched rows, insert the source rows that have no match, or delete target rows that no source row matches.',
        'The source should be one row for each key. A DISTINCT ON subquery that keeps the newest change for each customer is a source of that shape, so the merge applies one change to each target row.',
        'SQL Server also has MERGE. In that dialect, the actions apply to the joined rows in an unordered way, so a source with several rows for one key needs the same care as it does here.',
      ],
      example: 'SELECT c.id, c.region AS current_region, l.region AS feed_region\nFROM customers AS c\nLEFT JOIN (\n  SELECT DISTINCT ON (customer_id) customer_id, region\n  FROM staging_customer_regions\n  ORDER BY customer_id, changed_at DESC\n) AS l ON l.customer_id = c.id\nORDER BY c.id;',
      predict: {
        question: 'How many rows does this query return? It lists every customer beside the newest feed region, when the feed has one.',
        options: [
          { id: 'a', text: 'Eight, one for each customer' },
          { id: 'b', text: 'Six, one for each customer the feed names' },
          { id: 'c', text: 'Nine, one for each feed row' },
        ],
        answer: 'a',
        answerRows: 8,
        explanation: 'The query starts from customers, so it has one row for each of the eight customers. Customers the feed does not name get an empty feed region. The customer 99 row in the feed has no customer and is not in the output.',
      },
      commonMistakes: [
        { mistake: 'MERGE_NOT_MATCHED', text: 'Without a WHEN NOT MATCHED branch, feed rows that have no target row are dropped, so new customers never reach the target.' },
        { mistake: 'MERGE_NO_DELETE', text: 'A target row that the source no longer names stays in the table unless a WHEN NOT MATCHED BY SOURCE branch deletes it.' },
      ],
      citations: ['pg-merge-join', 'ms-merge-statement', 'ms-merge-unordered'],
      demonstrations: [
        { claim: 'The feed names customer 99, which is not in customers, so a merge into customers must leave it out.', sql: 'SELECT COUNT(*)::integer AS unknown_customers FROM staging_customer_regions WHERE customer_id NOT IN (SELECT id FROM customers);' },
      ],
    },
    {
      id: 'c11-s3',
      title: 'Watermarks, SCD type 2 and views',
      paragraphs: [
        'A watermark is the newest time that an earlier load took. The next load takes only rows strictly newer than the watermark, so a row at exactly the watermark time is not loaded again. The load then moves the watermark to the newest row it has seen.',
        'SCD type 2 keeps history. A change closes the current version of a row and adds a new current version, so the table shows what each customer’s region was at each time. Each customer has exactly one current version, which has no end time.',
        'A view stores a query, not a copy of the data. Reading the view runs its query against the current tables, so it always shows current rows.',
      ],
      example: 'SELECT customer_id, region, valid_from, valid_to\nFROM customer_versions\nWHERE customer_id IN (4, 6)\nORDER BY customer_id, valid_from;',
      predict: {
        question: 'How many rows does this query return? It lists the version history of customers 4 and 6.',
        options: [
          { id: 'a', text: 'Four rows, two versions for each customer' },
          { id: 'b', text: 'Two rows, one current version each' },
          { id: 'c', text: 'Sixteen rows, one for every version in the table' },
        ],
        answer: 'a',
        answerRows: 4,
        explanation: 'Each of these customers has an old version that ended on 1 July 2025 and a current version that has no end time. The history has two versions for each customer, so the query returns four rows.',
      },
      commonMistakes: [
        { mistake: 'WATERMARK_BOUNDARY', text: 'A comparison with >= loads the scan at the watermark time again. The watermark is the last time already loaded, so only rows strictly later are new.' },
        { mistake: 'SCD2_MULTIPLE_CURRENT', text: 'Adding a new version without closing the old one leaves two current rows for the customer, and the history cannot say which region applies now.' },
      ],
      citations: ['pg-view-query', 'pg-view-runs-each-time'],
      demonstrations: [
        { claim: 'One scan sits at exactly the watermark time, the boundary row that a >= comparison would load again.', sql: 'SELECT COUNT(*)::integer AS at_watermark FROM staging_scans WHERE occurred_at = (SELECT last_loaded_at FROM load_watermark WHERE id = 1);' },
        { claim: 'Customer 4 has no region now, and a comparison with = never matches a NULL.', sql: 'SELECT COUNT(*)::integer AS matches FROM customers WHERE region = NULL;' },
      ],
    },
  ],
};
