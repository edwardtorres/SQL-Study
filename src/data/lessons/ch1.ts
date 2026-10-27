import type { Lesson } from '../../core/lesson';

// Chapter 1: Read the dispatch board. Examples run on the visible sample; answerRows is the engine's count.
export const lesson1: Lesson = {
  chapterId: 1,
  sections: [
    {
      id: 'c1-s1',
      title: 'Read columns and tables',
      paragraphs: [
        'A query names the columns it wants and the table they come from. SELECT lists the columns; FROM names the table. With no WHERE, join or GROUP BY, each row of the table becomes one row of the result.',
        'LIMIT caps how many rows come back. Sort first with ORDER BY, so the rows you keep are the ones you meant to keep.',
      ],
      example: 'SELECT id, tracking_code, status\nFROM shipments\nORDER BY id\nLIMIT 3;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: '3 rows' },
          { id: 'b', text: 'Every shipment in the table' },
          { id: 'c', text: 'No rows' },
        ],
        answer: 'a',
        answerRows: 3,
        explanation: 'LIMIT 3 keeps the first three rows after sorting by id. The manual says LIMIT returns no more rows than its count, and fewer only when the query yields fewer.',
      },
      commonMistakes: [
        { mistake: 'TIE_NONDETERMINISTIC', text: 'Leaving out ORDER BY before LIMIT returns whichever rows come out first. Sort first, then limit.' },
        { mistake: 'ORDER_DIRECTION', text: 'ORDER BY sorts ascending by default. Write DESC when the largest value should come first.' },
      ],
      citations: ['pg-select-structure', 'pg-limit', 'pg-order-direction'],
    },
    {
      id: 'c1-s2',
      title: 'Filter rows with WHERE',
      paragraphs: [
        'WHERE keeps only the rows whose condition is true. Rows where the condition is false are dropped.',
        'AND needs both conditions to hold. OR needs at least one. When you mix them, add parentheses so the grouping says what you mean.',
      ],
      example: "SELECT id, status, weight_kg\nFROM shipments\nWHERE status = 'queued' AND weight_kg >= 1500\nORDER BY id;",
      predict: {
        question: 'How many shipments does this query return?',
        options: [
          { id: 'a', text: 'Every shipment that is heavy, whatever its status' },
          { id: 'b', text: 'Every queued shipment, whatever its weight' },
          { id: 'c', text: 'Only the shipments that meet both conditions' },
        ],
        answer: 'c',
        answerRows: 11,
        explanation: 'AND needs both conditions: queued, and at least 1500 kg. Heavy shipments in other statuses and light queued shipments both fall out. Replace AND with OR and far more rows match.',
      },
      commonMistakes: [
        { mistake: 'AND_OR_PRECEDENCE', text: 'A OR B AND C does not mean (A OR B) AND C. AND binds first. Add parentheses when you mean the other grouping.' },
        { mistake: 'GE_VS_GT', text: '>= keeps the boundary value, > drops it. Check the ticket wording for exactly-at-the-limit cases.' },
      ],
      citations: ['pg-select-where'],
    },
    {
      id: 'c1-s3',
      title: 'Patterns, lists, ranges and distinct values',
      paragraphs: [
        'LIKE matches text against a pattern. % stands for any run of characters, and _ stands for exactly one character.',
        'IN checks membership in a list. BETWEEN checks a range and includes both ends. DISTINCT removes duplicate rows from the result.',
      ],
      example: 'SELECT DISTINCT status\nFROM shipments\nORDER BY status;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: '4 rows, one for each status' },
          { id: 'b', text: 'One row per shipment in the table' },
          { id: 'c', text: 'Exactly 1 row' },
        ],
        answer: 'a',
        answerRows: 4,
        explanation: 'DISTINCT removes duplicate rows from the result. DISTINCT keeps one row for each different value. It removes repeats after the select list is computed, so duplicate statuses are dropped.',
      },
      commonMistakes: [
        { mistake: 'DISTINCT_MISUSE', text: 'Without DISTINCT, a column with repeated values returns each value once for every row that has it.' },
        { mistake: 'LIKE_WILDCARD', text: 'LIKE must match the entire string. With no leading %, the match must start at the first character; with no trailing %, it must reach the last character. Put % at both ends to match anywhere within the text.' },
        { mistake: 'BETWEEN_END_BOUND', text: 'BETWEEN includes its end value. A plain date as the end of a timestamp range means midnight, so the rest of that day falls outside the range.' },
      ],
      citations: ['pg-like-wildcards', 'pg-between', 'pg-distinct'],
    },
  ],
};
