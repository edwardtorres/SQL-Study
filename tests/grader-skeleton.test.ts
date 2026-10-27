import { describe, expect, test } from 'vitest';
import { isBareSkeleton } from '../src/grader/skeleton';

describe('bare skeleton starters', () => {
  test.each([
    'SELECT id, tracking_code, weight_kg\nFROM shipments;\n',
    'SELECT shipment_id, id AS event_id, status, occurred_at\nFROM shipment_events;',
    'SELECT id, name FROM customers',
  ])('accepts a column list and one table: %s', async (sql) => {
    await expect(isBareSkeleton(sql)).resolves.toBe(true);
  });

  test.each([
    "SELECT id FROM shipments WHERE status = 'queued'",
    'SELECT id FROM shipments ORDER BY id',
    'SELECT id FROM shipments LIMIT 5',
    'SELECT status, COUNT(*) FROM shipments GROUP BY status',
    'SELECT id FROM shipments s JOIN customers c ON c.id = s.customer_id',
    'WITH x AS (SELECT id FROM shipments) SELECT id FROM x',
    'SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM shipments',
    "SELECT CASE WHEN weight_kg > 500 THEN 'heavy' END FROM shipments",
    'SELECT DISTINCT status FROM shipments',
    'SELECT id FROM shipments UNION SELECT id FROM invoices',
    'SELECT id + 1 FROM shipments',
  ])('rejects anything beyond a skeleton: %s', async (sql) => {
    await expect(isBareSkeleton(sql)).resolves.toBe(false);
  });
});
