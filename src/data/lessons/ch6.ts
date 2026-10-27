import type { Lesson } from '../../core/lesson';

// Chapter 6: Shape the report. Examples run on the visible sample; answerRows is the engine's count.
export const lesson6: Lesson = {
  chapterId: 6,
  sections: [
    {
      id: 'c6-s1',
      title: 'CASE picks the first true branch',
      paragraphs: [
        'A CASE expression tests conditions in order and returns the value of the first one that is true. If no condition is true and there is no ELSE, the result is NULL.',
        'A NULL weight is not less than 1000, so the test is not true. It does not match the WHEN branch; it falls through to whatever comes next, which is ELSE here.',
      ],
      example: "SELECT id, weight_kg\nFROM shipments\nWHERE id <= 40\n  AND CASE WHEN weight_kg < 1000 THEN 'light' ELSE 'heavy' END = 'light'\nORDER BY id;",
      predict: {
        question: 'Which shipments will this query return? Some shipments in the first forty have no weight.',
        options: [
          { id: 'a', text: 'Every shipment with an id of 40 or less' },
          { id: 'b', text: 'Only shipments with a known weight under 1000 kg' },
          { id: 'c', text: 'Every shipment without a weight, plus the light ones' },
        ],
        answer: 'b',
        answerRows: 14,
        explanation: 'A missing weight fails the WHEN test and takes ELSE, which is heavy. So only known weights under 1000 kg pass the final filter.',
      },
      commonMistakes: [
        { mistake: 'NULL_AS_DEFAULT', text: 'A NULL does not satisfy a WHEN test, so it falls to ELSE. Add a WHEN ... IS NULL branch for a missing value.' },
        { mistake: 'CASE_ORDER', text: 'The first true WHEN wins. Put the more specific test before a broader one. Otherwise the broader test takes the rows the specific test was meant to label.' },
      ],
      citations: ['pg-case-generic', 'pg-case-else-null', 'pg-null-unknown', 'pg-three-valued'],
    },
    {
      id: 'c6-s2',
      title: 'Text functions and casts',
      paragraphs: [
        'LEFT(text, n) keeps the first n characters, and UPPER changes letters to capitals. Both change each row’s value, not the number of rows. PostgreSQL counts string positions from 1, so a start of 0 is one place before the text.',
        'The || operator joins two strings, and a NULL operand makes the joined result NULL. CONCAT skips NULL arguments instead. A cast with :: changes a value’s type; For numeric values, ROUND breaks ties away from zero before a cast to integer, and integer division truncates.',
      ],
      example: 'SELECT id, UPPER(LEFT(name, 3)) AS code\nFROM customers\nORDER BY id;',
      predict: {
        question: 'How many rows will this query return?',
        options: [
          { id: 'a', text: 'One row for each customer' },
          { id: 'b', text: 'One row for each customer that has a shipment' },
          { id: 'c', text: 'One row for each shipment' },
        ],
        answer: 'a',
        answerRows: 8,
        explanation: 'Text functions change values in each row. They do not filter or repeat rows, so each row corresponds to one customer.',
      },
      commonMistakes: [
        { mistake: 'STRING_INDEX', text: 'PostgreSQL counts string positions from 1, so a start of 0 is one place before the text. A start of 0 quietly shortens the result by one character.' },
        { mistake: 'CONCAT_NULL', text: 'With ||, one missing part makes the whole label NULL. Use COALESCE for the fallback text, or CONCAT when NULL parts should be skipped.' },
        { mistake: 'CAST_ROUNDING', text: 'Truncating and rounding give different whole numbers. Read the ticket: nearest whole number means ROUND, not TRUNC.' },
      ],
      citations: ['pg-left-function', 'pg-upper', 'pg-substring-start', 'pg-concat-operator', 'pg-concat-ignores', 'pg-round-ties', 'pg-int-division'],
      demonstrations: [
        { claim: "The || operator returns NULL when either side is NULL; CONCAT skips a NULL argument.", sql: "SELECT 'Region: ' || NULL::text AS with_operator, CONCAT('Region: ', NULL::text) AS with_concat;" },
        { claim: "SUBSTRING counts positions from 1, so a start of 0 shortens the result by one character.", sql: "SELECT SUBSTRING('Aster' FROM 0 FOR 3) AS from_zero, SUBSTRING('Aster' FROM 1 FOR 3) AS from_one;" },
      ],
    },
    {
      id: 'c6-s3',
      title: 'Dates and time zones',
      paragraphs: [
        'A timestamp with time zone is one moment. AT TIME ZONE converts it to the wall-clock time in a named zone, and the calendar day then depends on that zone. Name the zone whenever a ticket says a day, a month or an hour.',
        'BETWEEN includes both endpoints, so a range that ends at 23:59:59 misses the last fraction of that second. A half-open range, with >= on the start and < on the next day, keeps every moment of the day.',
      ],
      example: "SELECT id, booked_at\nFROM shipments\nWHERE booked_at >= '2026-01-31T00:00:00Z'\n  AND booked_at < '2026-02-01T00:00:00Z'\nORDER BY id;",
      predict: {
        question: 'Which shipments will this query return? The range is in UTC.',
        options: [
          { id: 'a', text: 'Both shipments booked on 31 January, UTC, including the last moment of the day' },
          { id: 'b', text: 'Only the shipment booked at midnight' },
          { id: 'c', text: 'None, because the range ends before the day does' },
        ],
        answer: 'a',
        answerRows: 2,
        explanation: 'The start is the first moment of the day and the end is the first moment of the next day. Every moment in between is kept, including 23:59:59.999.',
      },
      commonMistakes: [
        { mistake: 'BETWEEN_END_BOUND', text: 'Half-open ranges: start with >= the first instant of the period and stop with < the first instant of the next period. Shown below, a BETWEEN range that stops at 23:59:59 drops the last fraction of a second.' },
        { mistake: 'BETWEEN_END_BOUND', text: 'BETWEEN includes its end value. A range ending at 23:59:59 misses the last fraction of a second, so use < the next day.' },
        { mistake: 'TIMEZONE_ASSUMED', text: 'Without AT TIME ZONE, a timestamp literal with no zone is read in the session’s TimeZone setting, so the day boundary depends on that setting. Name the zone in the query.' },
      ],
      citations: ['pg-at-time-zone', 'pg-at-time-zone-out', 'pg-between', 'pg-timezone-assumed'],
      demonstrations: [
        { claim: "A range that ends at 23:59:59 with BETWEEN misses the last fraction of that second; a half-open range keeps the whole day.", sql: "SELECT COUNT(*) FILTER (WHERE booked_at BETWEEN '2026-01-31T00:00:00Z' AND '2026-01-31T23:59:59Z')::integer AS between_end, COUNT(*) FILTER (WHERE booked_at >= '2026-01-31T00:00:00Z' AND booked_at < '2026-02-01T00:00:00Z')::integer AS half_open FROM shipments;" },
      ],
    },
  ],
};
