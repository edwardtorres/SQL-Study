import type { Lesson } from '../../core/lesson';

// Chapter 3: Daily totals. Examples run on the visible sample; answerRows is the engine's count.
export const lesson3: Lesson = {
  chapterId: 3,
  sections: [
    {
      id: 'c3-s1',
      title: 'Aggregates collapse many rows into one',
      paragraphs: [
        'COUNT, SUM, AVG, MIN and MAX read many rows and return one value. SUM, AVG, MIN and MAX skip NULL inputs. COUNT(*) counts every row, and COUNT(column) counts only the rows where that column is not NULL.',
        'Without GROUP BY, the whole table is one group, so the query returns one row unless a HAVING clause eliminates it.',
      ],
      example: 'SELECT COUNT(*)::integer AS shipments,\n       MIN(weight_kg) AS lightest,\n       MAX(weight_kg) AS heaviest\nFROM shipments;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: 'One row with the three totals' },
          { id: 'b', text: 'One row for each shipment' },
          { id: 'c', text: 'No rows, because MIN and MAX skip NULL' },
        ],
        answer: 'a',
        answerRows: 1,
        explanation: 'With no GROUP BY, every row belongs to one group, and an aggregate query returns one row for that group, however many shipments there are.',
      },
      commonMistakes: [
        { mistake: 'COUNT_STAR_VS_COL', text: 'COUNT(*) counts rows with missing values too. Use COUNT(column) when only the recorded values should count.' },
        { mistake: 'AGGREGATE_CHOICE', text: 'MIN and MAX give the smallest and largest values. Swapping them, or using AVG where the ticket wants a total, changes the answer.' },
      ],
      citations: ['pg-sum-nonnull', 'pg-min', 'pg-max', 'pg-count-star', 'pg-count-col', 'pg-n-nonnull'],
    },
    {
      id: 'c3-s2',
      title: 'Group with GROUP BY, then filter groups with HAVING',
      paragraphs: [
        'GROUP BY makes one group for each distinct value of the grouped columns. Every column in the select list must either be grouped or be inside an aggregate.',
        'WHERE filters the rows before grouping. HAVING filters the groups after they have been counted, so a condition on COUNT(*) belongs in HAVING.',
      ],
      example: 'SELECT customer_id, COUNT(*)::integer AS shipments\nFROM shipments\nGROUP BY customer_id\nHAVING COUNT(*) > 30\nORDER BY customer_id;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: 'One row for each customer with more than 30 shipments' },
          { id: 'b', text: 'One row for each shipment' },
          { id: 'c', text: 'No rows, because HAVING runs before the count' },
        ],
        answer: 'a',
        answerRows: 6,
        explanation: 'GROUP BY counts the shipments for each customer first. HAVING then keeps only the groups that pass its test. The condition cannot go in WHERE, because a row does not yet know its group’s count.',
      },
      commonMistakes: [
        { mistake: 'MISSING_GROUP_COL', text: 'Grouping by the wrong column, or by an extra one, changes the grain. Each output row must match one group in the ticket.' },
        { mistake: 'WHERE_VS_HAVING', text: 'A threshold on a count needs HAVING. Leaving it out keeps every group, not only the large ones.' },
      ],
      citations: ['pg-group-having', 'pg-where-having'],
    },
    {
      id: 'c3-s3',
      title: 'Averages, rounding and integer division',
      paragraphs: [
        'AVG and SUM skip NULL values, so a missing weight is not counted as zero. Use COALESCE only when a zero really is the value you want.',
        'Dividing one integer by another truncates the fraction before any ROUND runs. Multiply by 100.0, or divide numeric values, to keep the decimals.',
      ],
      example: 'SELECT route_id,\n       ROUND(AVG(weight_kg), 1) AS avg_weight_kg,\n       ROUND(COUNT(weight_kg) * 100.0 / COUNT(*), 1) AS pct_weighed\nFROM shipments\nGROUP BY route_id\nORDER BY route_id;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: 'One row for each route' },
          { id: 'b', text: 'One row for each shipment' },
          { id: 'c', text: 'A single row with the overall average' },
        ],
        answer: 'a',
        answerRows: 6,
        explanation: 'The query groups by route, so each route gets one output row with its average and its percentage weighed.',
      },
      commonMistakes: [
        { mistake: 'INTEGER_DIVISION', text: 'COUNT(weight_kg) / COUNT(*) returns 0 for any ratio below one. Multiply by 100.0 first, or divide numeric values.' },
        { mistake: 'NULL_AS_DEFAULT', text: 'AVG(COALESCE(weight_kg, 0)) counts each missing weight as zero and drags the average down. Only do that when zero is the true value.' },
      ],
      citations: ['pg-n-nonnull', 'pg-int-division'],
    },
  ],
};
