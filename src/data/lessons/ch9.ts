import type { Lesson } from '../../core/lesson';

// Chapter 9: Own the data. Examples are read-only and run on the visible sample; the write tickets change data in a rolled-back copy.
export const lesson9: Lesson = {
  chapterId: 9,
  sections: [
    {
      id: 'c9-s1',
      title: 'Tables and the rules they enforce',
      paragraphs: [
        'A table’s definition sets each column’s type and the constraints the database enforces. Column types say what a value can be; constraints say which values are allowed. A primary key identifies each row, and a foreign key ties a column to rows in another table.',
        'The rules are enforced by the database, not by the query that writes the row. A write that breaks a constraint fails, so the rule holds for every application that uses the table.',
      ],
      example: 'SELECT id, tracking_code, weight_kg\nFROM shipments\nWHERE weight_kg IS NULL\nORDER BY id;',
      predict: {
        question: 'How many rows will this query return? weight_kg is a column with no NOT NULL constraint.',
        options: [
          { id: 'a', text: 'Twelve rows, the shipments with no recorded weight, which the table allows' },
          { id: 'b', text: 'No rows, because the table forbids a missing weight' },
          { id: 'c', text: 'Two hundred and forty rows, one for each shipment' },
        ],
        answer: 'a',
        answerRows: 12,
        explanation: 'weight_kg has no NOT NULL constraint, so the table stores a missing weight as NULL. The filter keeps those shipments.',
      },
      commonMistakes: [
        { mistake: 'CONSTRAINT_MISSING', text: 'A primary key requires values to be both unique and not null. Leaving the key off lets a repeated or missing id through, and the table stops identifying rows.' },
        { mistake: 'CONSTRAINT_MISSING', text: 'A CHECK constraint is a rule that a Boolean expression must satisfy. Without it, a value the ticket forbids is stored without any error.' },
      ],
      citations: ['pg-pk-meaning', 'pg-pk-unique-notnull', 'pg-unique', 'pg-fk', 'pg-check'],
      demonstrations: [
        { claim: 'Every shipments id is unique, as the primary key requires, so the distinct count equals the row count.', sql: 'SELECT COUNT(*)::integer AS shipment_rows, COUNT(DISTINCT id)::integer AS distinct_ids FROM shipments;' },
      ],
    },
    {
      id: 'c9-s2',
      title: 'UPDATE and DELETE change the rows their WHERE names',
      paragraphs: [
        'UPDATE changes the specified columns in all rows that satisfy its condition. DELETE removes the rows its condition matches, and with no WHERE clause it removes every row in the table. Begin a change with a SELECT that uses the same condition, so you can see which rows it will touch.',
        'A subquery in the condition lets one table be filtered by another. The subquery supplies the values to match, so the data change needs no join.',
      ],
      example: "SELECT id, status\nFROM shipments\nWHERE status = 'cancelled'\nORDER BY id;",
      predict: {
        question: 'How many rows will this SELECT return? An UPDATE with the same condition would change the same rows.',
        options: [
          { id: 'a', text: 'Every shipment, 240 rows' },
          { id: 'b', text: 'Only the cancelled shipments, which the condition keeps' },
          { id: 'c', text: 'One row, because the statement names a status' },
        ],
        answer: 'b',
        answerRows: 64,
        explanation: 'The condition keeps only the shipments whose status is cancelled. An UPDATE or DELETE with the same WHERE changes exactly those rows.',
      },
      commonMistakes: [
        { mistake: 'MISSING_WHERE_ON_UPDATE', text: 'A DELETE without WHERE removes every row in the table, and an UPDATE without WHERE has no condition to narrow the rows it changes. Write the condition first, check it with a SELECT, then change the rows.' },
        { mistake: 'AND_OR_PRECEDENCE', text: 'OR widens a condition: a row that matches either side is removed. Group the sides with parentheses when they combine with AND, so each side keeps its meaning.' },
      ],
      citations: ['pg-update', 'pg-delete-absent'],
      demonstrations: [
        { claim: 'The number of invoices of cancelled shipments is the number of rows an UPDATE or DELETE with that subquery would change.', sql: "SELECT COUNT(*)::integer AS would_change FROM invoices WHERE shipment_id IN (SELECT id FROM shipments WHERE status = 'cancelled');" },
      ],
    },
    {
      id: 'c9-s3',
      title: 'Transactions: keep the group or undo it',
      paragraphs: [
        'A transaction bundles several statements. COMMIT keeps every change in the group, and ROLLBACK discards them all. Use ROLLBACK to test a change: run it inside BEGIN, check the result, and end with ROLLBACK so the table is unchanged.',
        'A transaction that has no COMMIT or ROLLBACK is still open. Other transactions should not be able to see its incomplete changes, so the ending statement is part of the work.',
        'In this sandbox, COMMIT is simulated. The grader keeps your changes inside its own transaction and rolls them back afterwards, so nothing persists between runs. On a real PostgreSQL server, COMMIT makes the changes permanent and visible to other sessions.',
      ],
      example: 'SELECT id, paid_at\nFROM invoices\nWHERE id <= 6\nORDER BY id;',
      predict: {
        question: 'How many rows will this query return? It runs after a dry run that cleared every paid date and ended with ROLLBACK.',
        options: [
          { id: 'a', text: 'Six rows, with the paid dates unchanged because the ROLLBACK discarded the dry run' },
          { id: 'b', text: 'Zero rows, because the dry run cleared the paid dates' },
          { id: 'c', text: 'One row, the last invoice that was paid' },
        ],
        answer: 'a',
        answerRows: 6,
        explanation: 'ROLLBACK discards the dry run. The first six invoices are still there, with their paid dates intact.',
      },
      commonMistakes: [
        { mistake: 'ROLLBACK_MISSING', text: 'COMMIT keeps the changes made since BEGIN. A test that must leave the table as it was ends with ROLLBACK, not COMMIT.' },
        { mistake: 'COMMIT_MISSING', text: 'ROLLBACK discards every change in the transaction. A batch that must be kept as a whole needs COMMIT at the end.' },
      ],
      citations: ['pg-tx-all-or-nothing', 'pg-rollback', 'pg-commit', 'pg-incomplete-hidden'],
    },
  ],
};
