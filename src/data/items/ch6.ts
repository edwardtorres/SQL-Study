import type { Challenge } from '../../core/types';
import { datasetsFor } from '../datasets';

const CONDITIONAL = 'https://www.postgresql.org/docs/18/functions-conditional.html';
const STRING = 'https://www.postgresql.org/docs/18/functions-string.html';
const DATETIME = 'https://www.postgresql.org/docs/18/functions-datetime.html';
const MATH = 'https://www.postgresql.org/docs/18/functions-math.html';
const AGGREGATE = 'https://www.postgresql.org/docs/18/functions-aggregate.html';
const DISPATCH = { colleague: 'Nera Vale', colleagueRole: 'Dispatch coordinator' };
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };
const BILLING = { colleague: 'Pella Reed', colleagueRole: 'Billing analyst' };
const CUSTOMERS = { colleague: 'Tamsin Rowe', colleagueRole: 'Customer success lead' };

// Chapter 6: Shape the report. CASE labels, text, dates and casts decide what a report shows; NULL and zones change the answer.
export const chapter6Items: readonly Challenge[] = [
  {
    id: 'c6-g1', chapterId: 6, role: 'guided', starterStyle: 'blanks', title: 'Weight bands with an unweighed label',
    ...DISPATCH,
    summary: 'Band early shipments by weight, and label the ones with no weight as unweighed.',
    instructions: 'Return id and weight_band for shipments with ids 1 through 40. weight_band is unweighed when weight_kg is missing, light when it is under 1000 kg, and heavy otherwise. Order by id. Column names and types: id (integer), weight_band (text).',
    starterSql: "SELECT id, CASE WHEN weight_kg IS NULL THEN 'unweighed' WHEN weight_kg < ____ THEN 'light' ELSE 'heavy' END AS weight_band\nFROM shipments\nWHERE id <= 40\nORDER BY id;",
    referenceSql: "SELECT id, CASE WHEN weight_kg IS NULL THEN 'unweighed' WHEN weight_kg < 1000 THEN 'light' ELSE 'heavy' END AS weight_band FROM shipments WHERE id <= 40 ORDER BY id;",
    wrongVariants: [
      { id: 'g1-no-null-branch', rule: 'unweighed-when-missing', mistake: 'NULL_AS_DEFAULT', sql: "SELECT id, CASE WHEN weight_kg < 1000 THEN 'light' ELSE 'heavy' END AS weight_band FROM shipments WHERE id <= 40 ORDER BY id;", explanation: 'It looks like the missing-weight branch was left out. A NULL weight fails the test and falls to ELSE, so an unweighed shipment is reported as heavy.' },
      { id: 'g1-order', rule: 'light-under-1000', mistake: 'CASE_ORDER', sql: "SELECT id, CASE WHEN weight_kg IS NULL THEN 'unweighed' WHEN weight_kg >= 0 THEN 'heavy' WHEN weight_kg < 1000 THEN 'light' END AS weight_band FROM shipments WHERE id <= 40 ORDER BY id;", explanation: 'It looks like the heavy test was written before the light test. The first true WHEN wins, so every weighed shipment becomes heavy.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'weight_band', type: 25 }],
    rules: [
      { id: "unweighed-when-missing", text: "A missing weight gives unweighed." },
      { id: "light-under-1000", text: "A weight under 1000 kg gives light." },
    ],
    hints: [
      'A missing weight is not less than 1000, so a weight test cannot catch it. Which branch should catch a missing value?',
      'Check IS NULL first, then the threshold. The first WHEN that is true decides the label.',
      "WHEN weight_kg IS NULL THEN 'unweighed'\nWHEN weight_kg < 1000 THEN 'light'",
    ],
    docs: [{ label: 'PostgreSQL conditional expressions', url: CONDITIONAL }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c6-g2', chapterId: 6, role: 'guided', starterStyle: 'blanks', title: 'Three-letter customer codes',
    ...CUSTOMERS,
    summary: 'Build a short capital-letter code from each customer name for the account list.',
    instructions: 'Return id and code for every customer. code is the first three characters of the name in capital letters. Order by id. Column names and types: id (integer), code (text).',
    starterSql: 'SELECT id, UPPER(LEFT(name, ____)) AS code\nFROM customers\nORDER BY id;',
    referenceSql: 'SELECT id, UPPER(LEFT(name, 3)) AS code FROM customers ORDER BY id;',
    wrongVariants: [
      { id: 'g2-zero-start', rule: 'first-three-chars', mistake: 'STRING_INDEX', sql: 'SELECT id, UPPER(SUBSTRING(name, 0, 3)) AS code FROM customers ORDER BY id;', explanation: 'It looks like the substring starts at position 0. PostgreSQL string positions start at 1, so the window is one character short.' },
      { id: 'g2-second-letter', rule: 'first-three-chars', mistake: 'STRING_INDEX', sql: 'SELECT id, UPPER(SUBSTRING(name, 2, 3)) AS code FROM customers ORDER BY id;', explanation: 'It looks like the substring starts at position 2. The first letter is dropped, but the ticket wants the first three.' },
      { id: "g2-no-upper", rule: "capital-letters", mistake: "LIKE_CASE", sql: "SELECT id, LEFT(name, 3) AS code FROM customers ORDER BY id;", explanation: "It looks like the capital letters were left out. The ticket asks for the code in capitals, and the name keeps its own case." },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'code', type: 25 }],
    rules: [
      { id: "first-three-chars", text: "code is the first three characters of the name." },
      { id: "capital-letters", text: "code is in capital letters." },
    ],
    hints: [
      'The code is the start of the name. Which function keeps the first characters?',
      'LEFT takes the number of characters to keep. UPPER changes the case of its result.',
      'UPPER(LEFT(name, 3)) AS code',
    ],
    docs: [{ label: 'PostgreSQL string functions', url: STRING }],
    datasets: datasetsFor(['nulls', 'empty']),
  },
  {
    id: 'c6-g3', chapterId: 6, role: 'guided', starterStyle: 'blanks', title: 'Bookings on 31 January 2026, in UTC',
    ...BILLING,
    summary: 'Find the shipments booked on 31 January 2026, counting the last moments of the day.',
    instructions: 'Return id and booked_at for shipments booked on 31 January 2026 in UTC. A booking at 23:59:59.999 on that day counts. Order by id. Column names and types: id (integer), booked_at (timestamptz).',
    starterSql: "SELECT id, booked_at\nFROM shipments\nWHERE booked_at >= '2026-01-31T00:00:00Z'\n  AND booked_at ____ '2026-02-01T00:00:00Z'\nORDER BY id;",
    referenceSql: "SELECT id, booked_at FROM shipments WHERE booked_at >= '2026-01-31T00:00:00Z' AND booked_at < '2026-02-01T00:00:00Z' ORDER BY id;",
    wrongVariants: [
      { id: 'g3-between', mistake: 'BETWEEN_END_BOUND', sql: "SELECT id, booked_at FROM shipments WHERE booked_at BETWEEN '2026-01-31T00:00:00Z' AND '2026-01-31T23:59:59Z' ORDER BY id;", explanation: 'It looks like BETWEEN stopped at 23:59:59. A booking at 23:59:59.999 is later than that end bound, so it is missed.' },
      { id: 'g3-zone', mistake: 'TIMEZONE_ASSUMED', sql: "SELECT id, booked_at FROM shipments WHERE (booked_at AT TIME ZONE 'America/New_York')::date = '2026-01-31' ORDER BY id;", explanation: 'It looks like New York time was used. The ticket asks for UTC. A midnight UTC booking falls on 30 January in New York and drops out.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'booked_at', type: 1184 }],
    hints: [
      'A timestamp is a moment. The day ends just before the next day starts.',
      'Use a range that starts at the first moment of the day and stops before the next day begins.',
      "AND booked_at < '2026-02-01T00:00:00Z'",
    ],
    docs: [{ label: 'PostgreSQL date and time functions', url: DATETIME }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c6-i1', chapterId: 6, role: 'independent', starterStyle: 'skeleton', title: 'Weight labels for the dispatch board',
    ...DISPATCH,
    summary: 'Label each early shipment heavy, light or unweighed for the dispatch board.',
    instructions: 'For shipments with ids 1 through 40, return id and weight_label: unweighed when weight_kg is missing, heavy when it is 1000 kg or more, and light otherwise. Order by id. Column names and types: id (integer), weight_label (text).',
    starterSql: 'SELECT id, weight_kg\nFROM shipments;\n',
    referenceSql: "SELECT id, CASE WHEN weight_kg IS NULL THEN 'unweighed' WHEN weight_kg >= 1000 THEN 'heavy' ELSE 'light' END AS weight_label FROM shipments WHERE id <= 40 ORDER BY id;",
    wrongVariants: [
      { id: 'i1-no-null-branch', rule: 'unweighed-when-missing', mistake: 'NULL_AS_DEFAULT', sql: "SELECT id, CASE WHEN weight_kg >= 1000 THEN 'heavy' ELSE 'light' END AS weight_label FROM shipments WHERE id <= 40 ORDER BY id;", explanation: 'It looks like the missing-weight case was left out. NULL fails both tests and falls to ELSE, so the unweighed shipment is labelled light.' },
      { id: 'i1-order', rule: 'heavy-at-1000', mistake: 'CASE_ORDER', sql: "SELECT id, CASE WHEN weight_kg IS NULL THEN 'unweighed' WHEN weight_kg > 0 THEN 'light' WHEN weight_kg >= 1000 THEN 'heavy' ELSE 'light' END AS weight_label FROM shipments WHERE id <= 40 ORDER BY id;", explanation: 'It looks like the light test comes before the heavy test. Every weighed shipment matches the first WHEN, so no shipment is heavy.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'weight_label', type: 25 }],
    rules: [
      { id: "unweighed-when-missing", text: "A missing weight gives unweighed." },
      { id: "heavy-at-1000", text: "A weight of 1000 kg or more gives heavy." },
    ],
    hints: [
      'Three outcomes, and the missing case is one of them. Which test has to run first?',
      'Check for a missing weight first, then compare with 1000. Use ELSE for the rest.',
      "CASE WHEN weight_kg IS NULL THEN 'unweighed'\n  WHEN weight_kg >= 1000 THEN 'heavy' ELSE 'light' END",
    ],
    docs: [{ label: 'PostgreSQL conditional expressions', url: CONDITIONAL }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c6-i2', chapterId: 6, role: 'independent', starterStyle: 'skeleton', title: 'Tracking prefix and serial',
    ...PIPELINE,
    summary: 'Split each tracking code into its two-letter prefix and its four-digit serial for the scan feed.',
    instructions: 'For shipments with ids 1 through 5, return id, prefix (the first two characters of tracking_code) and serial (the last four characters). Order by id. Column names and types: id (integer), prefix (text), serial (text).',
    starterSql: 'SELECT id, tracking_code\nFROM shipments;\n',
    referenceSql: 'SELECT id, LEFT(tracking_code, 2) AS prefix, RIGHT(tracking_code, 4) AS serial FROM shipments WHERE id <= 5 ORDER BY id;',
    wrongVariants: [
      { id: 'i2-zero-start', rule: 'prefix-first-two', mistake: 'STRING_INDEX', sql: 'SELECT id, SUBSTRING(tracking_code, 0, 2) AS prefix, RIGHT(tracking_code, 4) AS serial FROM shipments WHERE id <= 5 ORDER BY id;', explanation: 'It looks like the prefix starts at position 0. PostgreSQL positions start at 1, so the prefix loses its second letter.' },
      { id: 'i2-five-chars', rule: 'serial-last-four', mistake: 'STRING_INDEX', sql: 'SELECT id, LEFT(tracking_code, 2) AS prefix, RIGHT(tracking_code, 5) AS serial FROM shipments WHERE id <= 5 ORDER BY id;', explanation: 'It looks like five characters were taken for the serial. The serial is four digits, and the fifth character from the end is a hyphen.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'prefix', type: 25 }, { name: 'serial', type: 25 }],
    rules: [
      { id: "prefix-first-two", text: "prefix is the first two characters of tracking_code." },
      { id: "serial-last-four", text: "serial is the last four characters." },
    ],
    hints: [
      'The prefix comes from the start of the code and the serial from the end. Which function takes characters from which side?',
      'LEFT takes characters from the start, RIGHT from the end. Count the characters the ticket asks for.',
      'LEFT(tracking_code, 2) AS prefix,\nRIGHT(tracking_code, 4) AS serial',
    ],
    docs: [{ label: 'PostgreSQL string functions', url: STRING }],
    datasets: datasetsFor(['nulls', 'empty']),
  },
  {
    id: 'c6-i3', chapterId: 6, role: 'independent', starterStyle: 'skeleton', title: 'January 2026 bookings, in UTC',
    ...CUSTOMERS,
    summary: 'List the early shipments booked in January 2026, using UTC for the month boundaries.',
    instructions: 'For shipments with ids 1 through 60, return id and booked_at when the booking falls in January 2026 in UTC. A booking at 23:59:59.999 on 31 January counts. Order by id. Column names and types: id (integer), booked_at (timestamptz).',
    starterSql: 'SELECT id, booked_at\nFROM shipments;\n',
    referenceSql: "SELECT id, booked_at FROM shipments WHERE id <= 60 AND booked_at >= '2026-01-01T00:00:00Z' AND booked_at < '2026-02-01T00:00:00Z' ORDER BY id;",
    wrongVariants: [
      { id: 'i3-between', mistake: 'BETWEEN_END_BOUND', sql: "SELECT id, booked_at FROM shipments WHERE id <= 60 AND booked_at BETWEEN '2026-01-01T00:00:00Z' AND '2026-01-31T23:59:59Z' ORDER BY id;", explanation: 'It looks like BETWEEN ended at 23:59:59 on 31 January. The last fraction of a second of the month is past that bound, so a late booking is missed.' },
      { id: 'i3-zone', mistake: 'TIMEZONE_ASSUMED', sql: "SELECT id, booked_at FROM shipments WHERE id <= 60 AND (booked_at AT TIME ZONE 'America/New_York') >= '2026-01-01T00:00:00' AND (booked_at AT TIME ZONE 'America/New_York') < '2026-02-01T00:00:00' ORDER BY id;", explanation: 'It looks like New York local time decided the month. The ticket asks for UTC, so bookings in the first hours of 1 January UTC are pushed into December.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'booked_at', type: 1184 }],
    hints: [
      'The last instant of January is a fraction of a second before February begins.',
      'Use a half-open range in UTC: start at the first instant of January, and stop before 1 February.',
      "AND booked_at >= '2026-01-01T00:00:00Z'\nAND booked_at < '2026-02-01T00:00:00Z'",
    ],
    docs: [{ label: 'PostgreSQL date and time functions', url: DATETIME }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
  {
    id: 'c6-i4', chapterId: 6, role: 'independent', starterStyle: 'skeleton', title: 'Average shipment weight in whole kilograms',
    ...CUSTOMERS,
    summary: 'Give each early customer an average shipment weight in whole kilograms for the account review.',
    instructions: 'For customers with ids 1 through 6, return customer_id and avg_kg, the average weight of their shipments rounded to the nearest whole kilogram. Missing weights are ignored. Order by customer_id. Column names and types: customer_id (integer), avg_kg (integer).',
    starterSql: 'SELECT customer_id, weight_kg\nFROM shipments;\n',
    referenceSql: 'SELECT customer_id, ROUND(AVG(weight_kg))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;',
    wrongVariants: [
      { id: 'i4-truncate', rule: 'round-nearest', mistake: 'CAST_ROUNDING', sql: 'SELECT customer_id, TRUNC(AVG(weight_kg))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;', explanation: 'It looks like the average was truncated, not rounded. An average of 1234.7 becomes 1234 instead of 1235.' },
      { id: 'i4-integer-division', rule: 'average-of-weights', mistake: 'INTEGER_DIVISION', sql: 'SELECT customer_id, (SUM(weight_kg) / COUNT(weight_kg))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;', explanation: 'It looks like SUM was divided by COUNT with integer division. Integer division truncates toward zero, so the result is never rounded.' },
      { id: "i4-null-zero", rule: "missing-ignored", mistake: "NULL_AS_DEFAULT", sql: "SELECT customer_id, ROUND(AVG(COALESCE(weight_kg, 0)))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;", explanation: "It looks like missing weights were counted as zero. The ticket says they are ignored, so the average drops toward zero for a customer with a missing weight." },
    ],
    ordered: true,
    columns: [{ name: 'customer_id', type: 23 }, { name: 'avg_kg', type: 23 }],
    rules: [
      { id: "round-nearest", text: "avg_kg is rounded to the nearest whole kilogram." },
      { id: "average-of-weights", text: "avg_kg is the average of the weights." },
      { id: "missing-ignored", text: "Missing weights are ignored." },
    ],
    hints: [
      'AVG returns a decimal. The ticket wants the nearest whole kilogram, not the lower one.',
      'Round the average first, then cast the rounded value to integer.',
      'ROUND(AVG(weight_kg))::integer AS avg_kg',
    ],
    docs: [{ label: 'PostgreSQL mathematical functions', url: MATH }, { label: 'PostgreSQL aggregate functions', url: AGGREGATE }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
  {
    id: 'c6-i5', chapterId: 6, role: 'independent', starterStyle: 'skeleton', title: 'Customer labels for the account card',
    ...CUSTOMERS,
    summary: 'Build the label printed on each account card: the name, then the region in brackets.',
    instructions: "Return id and label for each customer: the name, a space, then the region in brackets. Use unassigned inside the brackets when the region is missing, for example Brindle Pantry (South). Order by id. Column names and types: id (integer), label (text).",
    starterSql: 'SELECT id, name\nFROM customers;\n',
    referenceSql: "SELECT id, name || ' (' || COALESCE(region, 'unassigned') || ')' AS label FROM customers ORDER BY id;",
    wrongVariants: [
      { id: 'i5-concat-null', rule: 'brackets-always', mistake: 'CONCAT_NULL', sql: "SELECT id, name || ' (' || region || ')' AS label FROM customers ORDER BY id;", explanation: 'It looks like || was used on a region that can be missing. Joining with a NULL gives NULL, so the card has no label at all.' },
      { id: 'i5-fallback-order', rule: 'unassigned-when-missing', mistake: 'COALESCE_ORDER', sql: "SELECT id, name || ' (' || COALESCE('unassigned', region) || ')' AS label FROM customers ORDER BY id;", explanation: 'It looks like the fallback came first. COALESCE returns the first value that is not NULL, so unassigned always wins.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'label', type: 25 }],
    rules: [
      { id: "brackets-always", text: "Every label has its brackets." },
      { id: "unassigned-when-missing", text: "unassigned is used when the region is missing." },
    ],
    hints: [
      'Two parts can be missing, and || does not skip a missing part. Which function supplies a fallback?',
      'COALESCE returns its first argument that is not NULL. Put the region first and the fallback second.',
      "name || ' (' || COALESCE(region, 'unassigned') || ')'",
    ],
    docs: [{ label: 'PostgreSQL string functions', url: STRING }, { label: 'PostgreSQL conditional expressions', url: CONDITIONAL }],
    datasets: datasetsFor(['nulls', 'nulltext']),
  },
  {
    id: 'c6-b1-p1', chapterId: 6, role: 'boss', bossGroup: 'c6-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 1: weight bands by status',
    ...DISPATCH,
    summary: 'Count shipments in each weight band for every status, with missing weights shown as unweighed. Part 1 of 3.',
    instructions: "Part 1 of 3. For each status and weight band that occurs, count the shipments. The bands are: unweighed when weight_kg is missing, light when it is under 1000 kg, and heavy otherwise. Return status (text), weight_band (text) and shipments (integer). Order by status, then weight_band.",
    starterSql: 'SELECT status, weight_kg\nFROM shipments;\n',
    referenceSql: "SELECT status, CASE WHEN weight_kg IS NULL THEN 'unweighed' WHEN weight_kg < 1000 THEN 'light' ELSE 'heavy' END AS weight_band, COUNT(*)::integer AS shipments FROM shipments GROUP BY status, weight_band ORDER BY status, weight_band;",
    wrongVariants: [
      { id: 'b6p1-no-null-branch', rule: 'unweighed-band', mistake: 'NULL_AS_DEFAULT', sql: "SELECT status, CASE WHEN weight_kg < 1000 THEN 'light' ELSE 'heavy' END AS weight_band, COUNT(*)::integer AS shipments FROM shipments GROUP BY status, weight_band ORDER BY status, weight_band;", explanation: 'It looks like the unweighed branch is missing. Missing weights fall to ELSE and are counted as heavy.' },
      { id: 'b6p1-order', rule: 'light-under-1000', mistake: 'CASE_ORDER', sql: "SELECT status, CASE WHEN weight_kg IS NULL THEN 'unweighed' WHEN weight_kg >= 0 THEN 'heavy' WHEN weight_kg < 1000 THEN 'light' END AS weight_band, COUNT(*)::integer AS shipments FROM shipments GROUP BY status, weight_band ORDER BY status, weight_band;", explanation: 'It looks like the heavy test comes before the light test. The first true WHEN wins, so light is never used.' },
    ],
    ordered: true,
    columns: [{ name: 'status', type: 25 }, { name: 'weight_band', type: 25 }, { name: 'shipments', type: 23 }],
    rules: [
      { id: "unweighed-band", text: "A missing weight gives the unweighed band." },
      { id: "light-under-1000", text: "A weight under 1000 kg gives the light band." },
    ],
    hints: [
      'Group by the status and by the band. The band is itself a CASE expression.',
      'Put the missing-weight branch first in the CASE, then the threshold, then ELSE for the rest.',
      "CASE WHEN weight_kg IS NULL THEN 'unweighed'\n  WHEN weight_kg < 1000 THEN 'light' ELSE 'heavy' END",
    ],
    docs: [{ label: 'PostgreSQL conditional expressions', url: CONDITIONAL }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c6-b1-p2', chapterId: 6, role: 'boss', bossGroup: 'c6-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 2: booking days and prefixes',
    ...BILLING,
    summary: 'Give each early shipment its tracking prefix and its UTC booking date. Part 2 of 3.',
    instructions: "Part 2 of 3. For shipments with ids 1 through 10, return id, prefix (the first two characters of tracking_code) and booked_day, the calendar date of booked_at in UTC. Shipments 1 and 2 are booked on 2026-01-31 and shipments 3 through 10 on 2025-12-28, so booked_day runs from 2025-12-28 to 2026-01-31. Order by id. Column names and types: id (integer), prefix (text), booked_day (date).",
    starterSql: 'SELECT id, tracking_code, booked_at\nFROM shipments;\n',
    referenceSql: "SELECT id, LEFT(tracking_code, 2) AS prefix, (booked_at AT TIME ZONE 'UTC')::date AS booked_day FROM shipments WHERE id <= 10 ORDER BY id;",
    wrongVariants: [
      { id: 'b6p2-zero-start', rule: 'prefix-first-two', mistake: 'STRING_INDEX', sql: "SELECT id, SUBSTRING(tracking_code, 0, 2) AS prefix, (booked_at AT TIME ZONE 'UTC')::date AS booked_day FROM shipments WHERE id <= 10 ORDER BY id;", explanation: 'It looks like the prefix starts at position 0. PostgreSQL positions start at 1, so the prefix is one character short.' },
      { id: 'b6p2-zone', rule: 'utc-day', mistake: 'TIMEZONE_ASSUMED', sql: "SELECT id, LEFT(tracking_code, 2) AS prefix, (booked_at AT TIME ZONE 'America/New_York')::date AS booked_day FROM shipments WHERE id <= 10 ORDER BY id;", explanation: 'It looks like New York time was used for the day. The ticket asks for UTC, and early-morning UTC bookings fall on the previous day locally.' },
    ],
    ordered: true,
    columns: [{ name: 'id', type: 23 }, { name: 'prefix', type: 25 }, { name: 'booked_day', type: 1082 }],
    rules: [
      { id: "prefix-first-two", text: "prefix is the first two characters of tracking_code." },
      { id: "utc-day", text: "booked_day is the UTC calendar date." },
    ],
    hints: [
      'Two columns come from text and one from a timestamp. Which zone does the ticket name?',
      'LEFT takes the prefix. Convert booked_at to UTC first, then cast the result to date.',
      "LEFT(tracking_code, 2) AS prefix,\n(booked_at AT TIME ZONE 'UTC')::date AS booked_day",
    ],
    docs: [{ label: 'PostgreSQL date and time functions', url: DATETIME }, { label: 'PostgreSQL string functions', url: STRING }],
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c6-b1-p3', chapterId: 6, role: 'boss', bossGroup: 'c6-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 3: rounded weights by customer',
    ...PIPELINE,
    summary: 'Count each early customer’s shipments and show the rounded average weight. Part 3 of 3.',
    instructions: 'Part 3 of 3. For customers with ids 1 through 6, return customer_id, shipments (the number of shipments, including ones with a missing weight) and avg_kg (the average weight_kg rounded to the nearest whole kilogram; missing weights are ignored). Order by customer_id. Column names and types: customer_id (integer), shipments (integer), avg_kg (integer).',
    starterSql: 'SELECT customer_id, weight_kg\nFROM shipments;\n',
    referenceSql: 'SELECT customer_id, COUNT(*)::integer AS shipments, ROUND(AVG(weight_kg))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;',
    wrongVariants: [
      { id: 'b6p3-count-column', rule: 'counts-missing-weight', mistake: 'COUNT_STAR_VS_COL', sql: 'SELECT customer_id, COUNT(weight_kg)::integer AS shipments, ROUND(AVG(weight_kg))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;', explanation: 'It looks like COUNT(weight_kg) was used. That counts only shipments with a weight, but the ticket counts every shipment.' },
      { id: 'b6p3-truncate', rule: 'round-nearest', mistake: 'CAST_ROUNDING', sql: 'SELECT customer_id, COUNT(*)::integer AS shipments, TRUNC(AVG(weight_kg))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;', explanation: 'It looks like TRUNC was used, which drops the fraction. The ticket rounds to the nearest kilogram.' },
      { id: "b6p3-null-zero", rule: "missing-ignored", mistake: "NULL_AS_DEFAULT", sql: "SELECT customer_id, COUNT(*)::integer AS shipments, ROUND(AVG(COALESCE(weight_kg, 0)))::integer AS avg_kg FROM shipments WHERE customer_id <= 6 GROUP BY customer_id ORDER BY customer_id;", explanation: "It looks like missing weights were counted as zero in the average. The ticket ignores them, so a customer with a missing weight gets a lower average." },
    ],
    ordered: true,
    columns: [{ name: 'customer_id', type: 23 }, { name: 'shipments', type: 23 }, { name: 'avg_kg', type: 23 }],
    rules: [
      { id: "counts-missing-weight", text: "shipments includes ones with a missing weight." },
      { id: "round-nearest", text: "avg_kg is rounded to the nearest whole kilogram." },
      { id: "missing-ignored", text: "Missing weights are ignored in the average." },
    ],
    hints: [
      'Two aggregates over the same groups. One counts rows; the other ignores missing weights.',
      'COUNT(*) counts every shipment. AVG ignores missing weights. Round the average before the cast.',
      'COUNT(*)::integer AS shipments,\nROUND(AVG(weight_kg))::integer AS avg_kg',
    ],
    docs: [{ label: 'PostgreSQL mathematical functions', url: MATH }, { label: 'PostgreSQL aggregate functions', url: AGGREGATE }],
    datasets: datasetsFor(['nulls', 'ties']),
  },
];
