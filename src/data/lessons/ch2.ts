import type { Lesson } from '../../core/lesson';

// Chapter 2: Missing is meaningful. Examples run on the visible sample; answerRows is the engine's count.
export const lesson2: Lesson = {
  chapterId: 2,
  sections: [
    {
      id: 'c2-s1',
      title: 'Test for missing values with IS NULL',
      paragraphs: [
        'A missing value is stored as NULL, which means unknown. Do not read it as zero.',
        'A comparison with an unknown value is itself unknown, so = and <> never select a NULL. Use IS NULL and IS NOT NULL to test for missing values.',
      ],
      example: 'SELECT id, tracking_code\nFROM shipments\nWHERE driver_id = NULL;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: 'Every shipment with no driver assigned' },
          { id: 'b', text: 'No rows' },
          { id: 'c', text: 'All 240 shipments' },
        ],
        answer: 'b',
        answerRows: 0,
        explanation: 'driver_id = NULL is never true, because the result of comparing with NULL is unknown. Replace it with driver_id IS NULL to find the unassigned shipments.',
      },
      commonMistakes: [
        { mistake: 'NULL_EQUALS', text: 'Writing = NULL or <> NULL keeps no rows at all. The database cannot say whether an unknown value equals anything.' },
      ],
      citations: ['pg-is-null', 'pg-null-unknown', 'pg-equals-null-tip'],
    },
    {
      id: 'c2-s2',
      title: 'Three-valued logic and COALESCE',
      paragraphs: [
        'SQL conditions have three results: true, false, and unknown. WHERE keeps only the rows where the condition is true, so unknown rows are dropped.',
        'COALESCE returns the first of its arguments that is not NULL. Use it to give a missing value a clear label.',
      ],
      example: "SELECT id, COALESCE(region, 'unassigned') AS region\nFROM customers\nWHERE region = 'North' OR region <> 'North'\nORDER BY id;",
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: 'All 8 customers' },
          { id: 'b', text: 'The 5 customers with a region' },
          { id: 'c', text: 'No customers' },
        ],
        answer: 'b',
        answerRows: 5,
        explanation: 'Each customer with a region is true for one of the two tests. A customer whose region is NULL is unknown for both, so WHERE drops it. The COALESCE label never gets a chance to run for those rows.',
      },
      commonMistakes: [
        { mistake: 'NULL_AS_DEFAULT', text: 'Replacing NULL with 0 or empty text can hide missing data. Name the fallback for what it means, such as unassigned.' },
        { mistake: 'NULL_EQUALS', text: 'CASE WHEN x = NULL never takes the THEN branch. Test CASE WHEN x IS NULL instead.' },
      ],
      citations: ['pg-three-valued', 'pg-coalesce'],
    },
    {
      id: 'c2-s3',
      title: 'NULL in aggregates, joins and IN',
      paragraphs: [
        'COUNT(*) counts every row. COUNT(column) counts only the rows where that column is not NULL. SUM, AVG, MIN and MAX skip NULL values.',
        'In a LEFT JOIN, a row with no match gets NULL in the right-hand columns. And a NOT IN test against a list that contains NULL cannot return true for any row.',
      ],
      example: 'SELECT driver_id, COUNT(*) AS shipments\nFROM shipments\nGROUP BY driver_id\nORDER BY driver_id;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: '4 rows, one for each driver' },
          { id: 'b', text: '5 rows: four drivers and a NULL group' },
          { id: 'c', text: '240 rows, one per shipment' },
        ],
        answer: 'b',
        answerRows: 5,
        explanation: 'GROUP BY treats all the NULL driver ids as one group, like any other value. That group is listed beside the named drivers, as one more row.',
      },
      commonMistakes: [
        { mistake: 'COUNT_STAR_VS_COL', text: 'COUNT(*) counts rows with a missing value too. Use COUNT(column) when only real values should count.' },
        { mistake: 'NOT_IN_NULL', text: 'If the list in NOT IN contains NULL, the test is never true, so no rows return. Filter the NULLs out of the list first.' },
      ],
      citations: ['pg-count-col', 'pg-count-star', 'pg-left-join', 'pg-not-in-null'],
      demonstrations: [
        { claim: "GROUP BY puts all the NULL values in one group, as it does for any other value.", sql: "SELECT driver_id, COUNT(*)::integer AS shipments FROM shipments WHERE customer_id = 1 GROUP BY driver_id ORDER BY driver_id;" },
      ],
    },
  ],
};
