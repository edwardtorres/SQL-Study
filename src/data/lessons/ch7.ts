import type { Lesson } from '../../core/lesson';

// Chapter 7: Combine the feeds. Examples run on the visible sample; answerRows is the engine's row count.
export const lesson7: Lesson = {
  chapterId: 7,
  sections: [
    {
      id: 'c7-s1',
      title: 'UNION keeps each value once',
      paragraphs: [
        'UNION places the rows of the second query after the rows of the first. It also removes duplicate rows, so a value that both queries return appears once in the result.',
        'UNION ALL does the same placement and keeps every row. Choose it when repeats are meaningful, such as one row per event, and choose UNION when the ticket asks for each value once.',
      ],
      example: 'SELECT status\nFROM shipments\nUNION\nSELECT status\nFROM shipment_events\nORDER BY status;',
      predict: {
        question: 'How many rows will this query return? The shipments and the scans both contain a delivered status.',
        options: [
          { id: 'a', text: 'Eight, with delivered listed twice' },
          { id: 'b', text: 'Seven, with delivered listed once' },
          { id: 'c', text: 'Nine hundred and eighteen, one row for each shipment and each scan' },
        ],
        answer: 'b',
        answerRows: 7,
        explanation: 'Each feed has four distinct statuses, and delivered is in both. UNION keeps one copy of each value, so seven values remain.',
      },
      commonMistakes: [
        { mistake: 'UNION_DEDUPES', text: 'UNION removes repeats across both queries, so a value in both feeds is listed once. UNION ALL keeps every row, so a shared value appears twice.' },
        { mistake: 'SET_OPERATOR_CHOICE', text: 'Both queries must return the same number of columns with compatible types. Add or remove a column in one query so the two lists line up.' },
      ],
      citations: ['pg-union-appends', 'pg-union-dedupe', 'pg-distinct', 'pg-union-compatible'],
      demonstrations: [
        { claim: 'UNION treats two NULL values as the same value, so it keeps one NULL row. UNION ALL keeps both.', sql: "SELECT (SELECT COUNT(*) FROM (SELECT NULL::text AS v UNION SELECT NULL::text) AS kept)::integer AS with_union, (SELECT COUNT(*) FROM (SELECT NULL::text AS v UNION ALL SELECT NULL::text) AS kept)::integer AS with_union_all;" },
      ],
    },
    {
      id: 'c7-s2',
      title: 'INTERSECT and EXCEPT pick the overlap or the difference',
      paragraphs: [
        'INTERSECT keeps the rows that both queries return. EXCEPT keeps the rows of the first query that the second query does not return. Both also remove repeats unless ALL is written.',
        'The order of the two sides matters for EXCEPT. Swapping them returns a different set, so read the ticket for which feed it names first and which one it removes.',
      ],
      example: 'SELECT status\nFROM shipment_events\nEXCEPT\nSELECT status\nFROM shipments\nORDER BY status;',
      predict: {
        question: 'Which statuses will this query return? It starts from the scan statuses and removes any that a shipment has.',
        options: [
          { id: 'a', text: 'Only delivered, because it is the one status both feeds share' },
          { id: 'b', text: 'Arrived, booked and loaded, the scan statuses that no shipment has' },
          { id: 'c', text: 'All seven distinct statuses from both feeds' },
        ],
        answer: 'b',
        answerRows: 3,
        explanation: 'EXCEPT keeps the first query’s rows that the second query lacks. delivered is removed because shipments have it, and the three scan-only statuses remain.',
      },
      commonMistakes: [
        { mistake: 'SET_OPERATOR_CHOICE', text: 'INTERSECT keeps the values that both queries return. EXCEPT keeps the first query’s values that the second lacks. A ticket that asks for values in one feed only needs EXCEPT.' },
        { mistake: 'SET_OPERATOR_CHOICE', text: 'Swapping the two sides of EXCEPT returns the other feed’s leftovers. Name the feed the ticket keeps first, and put it on the left.' },
      ],
      citations: ['pg-intersect-rows', 'pg-intersect-all', 'pg-except-rows', 'pg-except-all'],
    },
    {
      id: 'c7-s3',
      title: 'Column matching, parentheses and ORDER BY',
      paragraphs: [
        'The two queries in a set operation must return the same number of columns, and the corresponding columns must have compatible types. The result takes its column names from the first query.',
        'INTERSECT binds more tightly than UNION and EXCEPT, so without parentheses the order of operations can differ from the one you read. A LIMIT or ORDER BY written after a set operation applies to the combined output unless each input is wrapped in parentheses.',
      ],
      example: '(SELECT id FROM shipments ORDER BY id LIMIT 3)\nUNION ALL\n(SELECT shipment_id FROM invoices ORDER BY shipment_id LIMIT 3)\nORDER BY id;',
      predict: {
        question: 'How many rows will this query return? Each part is limited to three rows inside its own parentheses.',
        options: [
          { id: 'a', text: 'Three, because the first LIMIT ends the whole result' },
          { id: 'b', text: 'Six, three from each table, because each LIMIT is inside its own parentheses' },
          { id: 'c', text: 'Every shipment and invoice, because UNION ALL ignores LIMIT' },
        ],
        answer: 'b',
        answerRows: 6,
        explanation: 'Parentheses give each query its own LIMIT. Three ids come from shipments and three from invoices, and UNION ALL keeps all six.',
      },
      commonMistakes: [
        { mistake: 'SET_LIMIT_SCOPE', text: 'Without parentheses, a LIMIT after a set operation applies to the whole combined output, not to one input. Wrap each input in parentheses when it needs its own LIMIT.' },
        { mistake: 'SET_OPERATOR_CHOICE', text: 'INTERSECT binds more tightly than UNION and EXCEPT. Write parentheses when the ticket names the order of the steps.' },
      ],
      citations: ['pg-union-compatible', 'pg-union-precedence', 'pg-union-parens'],
      demonstrations: [
        { claim: 'The column name of a set operation comes from its first query; the second query’s name is ignored.', sql: "SELECT 'queued' AS first_name UNION ALL SELECT 'billed' AS second_name;" },
        { claim: 'INTERSECT binds more tightly than UNION, so the parentheses change the count from two rows to one.', sql: "SELECT (SELECT COUNT(*) FROM (SELECT 1 AS x UNION SELECT 2 INTERSECT SELECT 2) AS unparenthesized)::integer AS without_parens, (SELECT COUNT(*) FROM ((SELECT 1 AS x UNION SELECT 2) INTERSECT SELECT 2) AS parenthesized)::integer AS with_parens;" },
      ],
    },
  ],
};
