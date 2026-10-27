import type { Lesson } from '../../core/lesson';

// Chapter 4: Connect the network. Examples run on the visible sample; answerRows is the engine's count.
export const lesson4: Lesson = {
  chapterId: 4,
  sections: [
    {
      id: 'c4-s1',
      title: 'Inner joins keep only the matches',
      paragraphs: [
        'A join puts columns from two tables side by side, using a condition that links their keys. An inner join keeps only the pairs where the condition holds.',
        'Name the key columns on both sides of ON, such as s.customer_id = c.id. A join with no matching row returns nothing for that pair.',
      ],
      example: 'SELECT s.id, c.name\nFROM shipments s\nJOIN customers c ON c.id = s.customer_id\nWHERE c.id = 7;',
      predict: {
        question: 'How many rows will this query return? Customer 7 has no shipments.',
        options: [
          { id: 'a', text: 'One row for customer 7' },
          { id: 'b', text: 'No rows, because nothing matches' },
          { id: 'c', text: 'Every shipment in the table' },
        ],
        answer: 'b',
        answerRows: 0,
        explanation: 'An inner join keeps only pairs that match. Customer 7 has no shipments, so there is no pair to keep. A RIGHT JOIN, or a LEFT JOIN with customers written first, would keep the customer.',
      },
      commonMistakes: [
        { mistake: 'LEFT_TO_INNER', text: 'An inner join silently drops rows with no match. When the ticket says to keep everything, use a LEFT JOIN.' },
        { mistake: 'JOIN_KEY', text: 'Joining on the wrong pair of columns matches unrelated rows. Check that the ON condition uses the key that links the tables.' },
      ],
      citations: ['pg-joined-table', 'pg-self-join'],
    },
    {
      id: 'c4-s2',
      title: 'Outer joins keep the unmatched side',
      paragraphs: [
        'A LEFT JOIN keeps every row from the left table. A row with no match gets NULL in the right-hand columns. RIGHT JOIN is the mirror image, and FULL JOIN keeps both sides.',
        'A WHERE test on a right-hand column is not TRUE for the NULL-extended rows, so WHERE drops them. Put the test in the ON clause, which is applied before the join, or test IS NULL on purpose.',
      ],
      example: 'SELECT c.id, c.name, s.id AS shipment_id\nFROM customers c\nLEFT JOIN shipments s ON s.customer_id = c.id\nWHERE c.id >= 7;',
      predict: {
        question: 'How many rows will this query return? Customers 7 and 8 both have no shipments.',
        options: [
          { id: 'a', text: 'Two rows, each with a NULL shipment id' },
          { id: 'b', text: 'No rows, because nothing matches' },
          { id: 'c', text: 'Every shipment of customers 7 and 8' },
        ],
        answer: 'a',
        answerRows: 2,
        explanation: 'The LEFT JOIN keeps each customer even without a match. Each unmatched customer gets one row with NULL in the shipment columns.',
      },
      commonMistakes: [
        { mistake: 'LEFT_TO_INNER', text: 'A WHERE test such as s.id > 0 on the right table removes the NULL rows. The NULL-extended rows are dropped, so only matched rows remain.' },
        { mistake: 'NULL_EQUALS', text: 'To find unmatched rows, test IS NULL. s.id = NULL never matches anything.' },
      ],
      citations: ['pg-left-join', 'pg-right-join', 'pg-outer-first'],
    },
    {
      id: 'c4-s3',
      title: 'Anti-joins and row explosion',
      paragraphs: [
        'Finding rows with no match is an anti-join. Use a LEFT JOIN with a test that the right side is NULL, or use NOT EXISTS, which asks whether a matching row exists at all.',
        'A join to a table with several matches per row repeats the left row once for each match. Count the grain you want first, then join. COUNT(*) after a one-to-many join counts the repeats too.',
      ],
      example: 'SELECT s.customer_id, COUNT(*)::integer AS rows_joined\nFROM shipments s\nJOIN shipment_events e ON e.shipment_id = s.id\nGROUP BY s.customer_id\nORDER BY s.customer_id;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: 'One row for each customer that has events' },
          { id: 'b', text: 'One row for each event' },
          { id: 'c', text: 'One row for each shipment' },
        ],
        answer: 'a',
        answerRows: 6,
        explanation: 'GROUP BY gives one row per customer. The count is of joined rows, one per event, so a shipment with four events counts four times. That is row explosion, and the number is not a count of shipments.',
      },
      commonMistakes: [
        { mistake: 'JOIN_FANOUT', text: 'A join to a one-to-many table repeats the rows on the other side. Counting after the join then counts the repeats.' },
        { mistake: 'NULL_EQUALS', text: 'An anti-join written as = NULL returns no rows. Use IS NULL, or NOT EXISTS.' },
      ],
      citations: ['pg-exists', 'pg-exists-true', 'pg-joined-table', 'pg-full-both'],
    },
  ],
};
