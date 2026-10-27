import type { Lesson } from '../../core/lesson';

// Chapter 5: Queries within queries. Examples run on the visible sample; answerRows is the engine's count.
export const lesson5: Lesson = {
  chapterId: 5,
  sections: [
    {
      id: 'c5-s1',
      title: 'Scalar subqueries return one value',
      paragraphs: [
        'A scalar subquery is a SELECT in parentheses that returns one row with one column. It can stand anywhere a single value can, such as a column in the select list or one side of a comparison.',
        'A subquery that refers to variables of the surrounding query is called a correlated subquery. Those variables act as constants during one evaluation of the subquery, so each outer row gets its own value.',
      ],
      example: 'SELECT s.id, (SELECT COUNT(*) FROM shipment_events e WHERE e.shipment_id = s.id) AS events\nFROM shipments s\nWHERE s.id <= 5\nORDER BY s.id;',
      predict: {
        question: 'How many rows will this query return? The subquery runs once for each shipment.',
        options: [
          { id: 'a', text: 'One row, because the subquery returns one value' },
          { id: 'b', text: 'One row for each shipment that is selected' },
          { id: 'c', text: 'One row for each event' },
        ],
        answer: 'b',
        answerRows: 5,
        explanation: 'A scalar subquery in the select list adds a column; it does not reduce or multiply rows. Each selected shipment keeps its own row and its own count.',
      },
      commonMistakes: [
        { mistake: 'CORRELATED_SCOPE', text: 'Inside a subquery, an unqualified column name refers to the nearest table that has it. Give each table an alias so the outer row is named explicitly.' },
        { mistake: 'NULL_NO_FALLBACK', text: 'A scalar subquery over no rows gives NULL. Use COALESCE when the ticket asks for a default value.' },
      ],
      citations: ['pg-scalar-subquery', 'pg-scalar-error', 'pg-scalar-null', 'pg-correlated'],
    },
    {
      id: 'c5-s2',
      title: 'IN and EXISTS test membership once',
      paragraphs: [
        'IN (subquery) asks whether a value appears in the list the subquery returns. EXISTS keeps each outer row at most once, however many matching rows the subquery holds.',
        'EXISTS asks whether any matching row exists, and it does not need the matches themselves. A NOT IN test over a list that contains NULL can never be TRUE, so use NOT EXISTS for anti-joins.',
      ],
      example: 'SELECT c.id, c.name\nFROM customers c\nWHERE c.id IN (SELECT customer_id FROM shipments)\nORDER BY c.id;',
      predict: {
        question: 'How many rows will this query return? Customers 7 and 8 have no shipments.',
        options: [
          { id: 'a', text: 'Eight rows, one for each customer' },
          { id: 'b', text: 'One row for each customer that has a shipment' },
          { id: 'c', text: 'One row for each shipment' },
        ],
        answer: 'b',
        answerRows: 6,
        explanation: 'IN keeps each customer whose id appears in the subquery list. Customers with no shipments are left out, and no customer is repeated.',
      },
      commonMistakes: [
        { mistake: 'JOIN_FANOUT', text: 'Joining to shipments instead of testing membership repeats each customer once per shipment. IN or EXISTS keeps one row per customer.' },
        { mistake: 'NOT_IN_NULL', text: 'NOT IN returns no rows when the list contains a NULL, because the test is never TRUE. Use NOT EXISTS when the subquery can return missing values.' },
      ],
      citations: ['pg-in-subquery', 'pg-exists-semijoin', 'pg-not-in-null'],
    },
    {
      id: 'c5-s3',
      title: 'Name steps with WITH',
      paragraphs: [
        'A WITH clause names an intermediate result. The main query reads it like a table, which lets a long nested query read top to bottom: first the step, then the filter that uses it.',
        'When the named step uses GROUP BY, each selected column must be grouped or aggregated inside it. The outer query can only use the columns the step returns.',
      ],
      example: 'WITH per_customer AS (\n  SELECT customer_id, COUNT(*) AS shipments\n  FROM shipments\n  GROUP BY customer_id\n)\nSELECT customer_id, shipments\nFROM per_customer\nWHERE shipments >= 50\nORDER BY customer_id;',
      predict: {
        question: 'How many rows will this query return? The count is taken once per customer inside the WITH clause.',
        options: [
          { id: 'a', text: 'One row for each customer' },
          { id: 'b', text: 'No rows, because no customer reaches the threshold' },
          { id: 'c', text: 'One row for each shipment' },
        ],
        answer: 'b',
        answerRows: 0,
        explanation: 'The WITH clause counts shipments per customer, and the outer WHERE keeps only the counts of 50 or more. The WHERE clause compares each count with 50, so only counts of 50 or more can pass. The counts come from the WITH step, not from the outer query.',
      },
      commonMistakes: [
        { mistake: 'MISSING_GROUP_COL', text: 'In a step that uses GROUP BY, a selected column must appear in GROUP BY or sit inside an aggregate. Otherwise the step has no single value per group.' },
        { mistake: 'GE_VS_GT', text: 'Thresholds in a step are easy to shift by one. Read the ticket: 30 or more means >= 30.' },
      ],
      citations: ['pg-with-intro', 'pg-cte-temp', 'pg-cte-once'],
    },
  ],
};
