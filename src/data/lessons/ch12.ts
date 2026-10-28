import type { Lesson } from '../../core/lesson';

// Chapter 12: Make it efficient. Examples are read-only SELECTs. A demonstration that shows a plan is the engine's own EXPLAIN output, never written by hand.
export const lesson12: Lesson = {
  chapterId: 12,
  sections: [
    {
      id: 'c12-s1',
      title: 'Indexes let the database find rows without reading the table',
      paragraphs: [
        'An index keeps the values of one or more columns in an order the database can search. With an index on the column a condition names, the database can find the matching rows directly instead of reading every row.',
        'The planner chooses between reading the table and using an index. Its choice depends on the condition, on its statistics about the table and on cost settings, and it can decide not to use an index when reading the table is cheaper.',
      ],
      example: 'SELECT id, status\nFROM shipment_scans_large\nWHERE id = 42;',
      predict: {
        question: 'How many rows does this query return? It looks up scan 42 by its primary key.',
        options: [
          { id: 'a', text: 'One row, scan 42' },
          { id: 'b', text: 'Twenty thousand rows, one for each scan' },
          { id: 'c', text: 'Zero rows, because the primary key has gaps' },
        ],
        answer: 'a',
        answerRows: 1,
        explanation: 'The table has a scan with id 42, and the primary key is unique, so the lookup returns that one row. On a table this large, a lookup by a key with an index is the case the index serves.',
      },
      commonMistakes: [
        { mistake: 'INDEX_WRONG_COLUMN', text: 'An index on a different column does not help a condition on another column. A lookup by shipment_id needs an index that begins with shipment_id, and an index on id, the primary key, does not help that lookup.' },
        { mistake: 'FUNCTION_ON_INDEXED_COLUMN', text: 'A function or a cast around the indexed column means the condition no longer compares the column itself, so the planner may not use the index and reads the table instead.' },
      ],
      citations: ['pg-index-planner', 'pg-index-not-used'],
      demonstrations: [
        { claim: 'The engine plans a lookup on the primary key of the large table with an index scan. The plan is the engine’s own output.', sql: 'EXPLAIN SELECT id, status FROM shipment_scans_large WHERE id = 42;', explain: true },
        { claim: 'Wrapping id in an expression changes the plan the engine chooses for the same lookup.', sql: 'EXPLAIN SELECT id, status FROM shipment_scans_large WHERE id + 0 = 42;', explain: true },
      ],
    },
    {
      id: 'c12-s2',
      title: 'Reading EXPLAIN: the plan says how the rows are read',
      paragraphs: [
        'EXPLAIN shows the execution plan the planner chose. The plan shows how the table is read, by a sequential scan, an index scan and so on.',
        'EXPLAIN without ANALYZE plans the statement and does not run it. The ANALYZE option of EXPLAIN runs the statement, so no ticket uses it. The ANALYZE command is a separate step that collects the statistics the planner uses, and the seed runs it on the large table.',
      ],
      example: 'SELECT status, COUNT(*)::integer AS scans\nFROM shipment_scans_large\nGROUP BY status\nORDER BY status;',
      predict: {
        question: 'How many rows does this query return? It counts the scans in each status.',
        options: [
          { id: 'a', text: 'Four rows, one for each status' },
          { id: 'b', text: 'Twenty thousand rows, one for each scan' },
          { id: 'c', text: 'One row, the total' },
        ],
        answer: 'a',
        answerRows: 4,
        explanation: 'Four statuses appear in the scans table, and the grouping returns one row for each. The plan for this query shows how the table is read to produce those four counts.',
      },
      commonMistakes: [
        { mistake: 'INDEX_MISSING', text: 'A plan that reads the whole table, with a sequential scan, means every row was read. When the condition uses a column with no usable index, an index on that column can change the plan, though the planner may still scan when the query returns many rows.' },
      ],
      citations: ['pg-explain-plan', 'pg-explain-analyze', 'pg-index-planner'],
      demonstrations: [
        { claim: 'This grouping has no WHERE clause, so every scan is read whatever indexes exist. The plan is the engine’s own output.', sql: 'EXPLAIN SELECT status, COUNT(*) FROM shipment_scans_large GROUP BY status;', explain: true },
        { claim: 'A range on the primary key reads only the scans in the range.', sql: 'EXPLAIN SELECT id, status FROM shipment_scans_large WHERE id BETWEEN 100 AND 110;', explain: true },
      ],
    },
    {
      id: 'c12-s3',
      title: 'Anti-patterns: SELECT *, leading wildcards and functions on columns',
      paragraphs: [
        'SELECT * asks for every column. The query returns columns that the report does not need, and a column added later changes what the report receives.',
        'A LIKE pattern that begins with a wildcard matches the end of a value, so a search cannot start from a known prefix. A pattern that begins with fixed text can start its search from that text, but a B-tree index supports it only in the C locale or with a pattern operator class such as text_pattern_ops.',
      ],
      example: "SELECT id, status\nFROM shipment_scans_large\nWHERE id <= 50 AND status LIKE 'del%'\nORDER BY id;",
      predict: {
        question: 'How many rows does this query return? It lists the delivered scans among the first fifty.',
        options: [
          { id: 'a', text: 'Twelve rows, the delivered scans among the first fifty' },
          { id: 'b', text: 'Fifty rows, one for each scan' },
          { id: 'c', text: 'Thirteen rows, including scan 51' },
        ],
        answer: 'a',
        answerRows: 12,
        explanation: 'A scan is delivered when its id leaves remainder 3 on division by 4, so scans 3, 7, 11 and onward are delivered. Up to id 50 there are twelve of them.',
      },
      commonMistakes: [
        { mistake: 'SELECT_STAR_COST', text: 'SELECT * returns every column. A report that needs two columns gets a wider result than it asked for, and a later change to the table changes what the report receives.' },
        { mistake: 'LEADING_WILDCARD', text: 'A leading wildcard matches any value that ends the same way, so the rows it returns change as well as its speed. Put the wildcard at the end when the ticket asks for a prefix.' },
      ],
      citations: ['pg-like-wildcards', 'pg-pattern-ops'],
      demonstrations: [
        { claim: 'Every status in the scans table ends in ed, so a pattern that starts with a wildcard and ends in ed matches every scan.', sql: "SELECT COUNT(*)::integer AS ends_in_ed FROM shipment_scans_large WHERE status LIKE '%ed';" },
      ],
    },
  ],
};
