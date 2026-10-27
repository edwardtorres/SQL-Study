import { PGlite } from '@electric-sql/pglite';
import { describe, expect, test } from 'vitest';
import { challenges, datasets, generateSeed, schema, seedSql } from '../src/data';
import type { Cell, TableName } from '../src/data';

describe('fictional deterministic freight seeds', () => {
  test('same seed and variant produce byte-identical data and SQL; another seed changes data', () => {
    for (const dataset of datasets) {
      expect(JSON.stringify(generateSeed(dataset.seed, dataset.variant))).toBe(JSON.stringify(generateSeed(dataset.seed, dataset.variant)));
      expect(seedSql(dataset.seed, dataset.variant)).toBe(seedSql(dataset.seed, dataset.variant));
      expect(JSON.stringify(generateSeed(dataset.seed + 1, dataset.variant))).not.toBe(JSON.stringify(generateSeed(dataset.seed, dataset.variant)));
    }
    expect(() => generateSeed(Number.NaN)).toThrow(/safe integer/);
  });

  test('all eight tables have unique primary keys and valid non-null foreign keys', () => {
    expect(schema).toHaveLength(8);
    for (const dataset of datasets) {
      const data = generateSeed(dataset.seed, dataset.variant);
      for (const table of schema) {
        const rows = data[table.name];
        expect(new Set(rows.map((row) => row.id)).size, `${dataset.id}.${table.name} PKs`).toBe(rows.length);
        for (const column of table.columns) {
          for (const row of rows) {
            expect(column.name in row, `${table.name}.${column.name} present`).toBe(true);
            if (!column.nullable) expect(row[column.name]).not.toBeNull();
          }
          if (column.references) {
            const [targetTable, targetColumn] = column.references.split('.') as [TableName, string];
            const target = new Set(data[targetTable].map((row) => row[targetColumn]));
            for (const row of rows) {
              if (row[column.name] !== null) expect(target.has(row[column.name]), `${table.name}.${column.name} valid FK`).toBe(true);
            }
          }
        }
      }
    }
  });

  test('edge fixtures deliberately cover empty results, boundaries, NULLs, ties and repeated values', () => {
    const sample = generateSeed(104729, 'sample');
    const empty = generateSeed(130363, 'nulls');
    const tied = generateSeed(155921, 'ties');
    expect(sample.shipments.length).toBeGreaterThanOrEqual(200);
    expect(sample.shipments.some((row) => row.weight_kg === 499)).toBe(true);
    expect(sample.shipments.some((row) => row.weight_kg === 500)).toBe(true);
    expect(sample.shipments.some((row) => row.weight_kg === 501)).toBe(true);
    expect(empty.shipments.filter((row) => row.status === 'queued' && Number(row.weight_kg) >= 500)).toEqual([]);
    expect(tied.shipments.filter((row) => row.status === 'queued' && row.weight_kg === 500)).toHaveLength(6);
    expect(sample.shipments.some((row) => row.driver_id === null)).toBe(true);
    expect(sample.shipments.some((row) => row.weight_kg === null)).toBe(true);
    expect(sample.customers.some((customer) => !sample.shipments.some((shipment) => shipment.customer_id === customer.id))).toBe(true);
    expect(new Set(sample.invoices.map((row) => row.amount)).size).toBeLessThan(sample.invoices.length);
    expect(new Set(tied.shipment_events.map((row) => `${row.shipment_id}:${row.occurred_at}`)).size).toBeLessThan(tied.shipment_events.length);
    expect(sample.shipments.some((row) => String(row.booked_at).startsWith('2026-01-01'))).toBe(true);
  });
});

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, cell]) => [key, comparable(cell)]));
  return value;
}

// Author validation against independent data algorithms. A separate reviewer still
// needs to solve the challenges blind; these tests do not claim to be that review.
test('the real engine accepts each fixture and references match independent answers; every wrong variant is caught', async () => {
  const db = await PGlite.create();
  const caughtWrong = new Set<string>();
  try {
    for (const dataset of datasets) {
      await db.exec(`CREATE SCHEMA fixture_${dataset.id}; SET search_path TO fixture_${dataset.id};`);
      await db.exec(seedSql(dataset.seed, dataset.variant));
      const data = generateSeed(dataset.seed, dataset.variant);
      const expected: Record<string, Record<string, Cell>[]> = {
        dispatch: data.shipments.filter((row) => row.status === 'queued' && row.weight_kg !== null && Number(row.weight_kg) >= 500)
          .sort((a, b) => Number(b.weight_kg) - Number(a.weight_kg) || Number(a.id) - Number(b.id)).slice(0, 5)
          .map((row) => ({ id: row.id!, tracking_code: row.tracking_code!, weight_kg: row.weight_kg! })),
        unbilled: data.customers.map((customer) => ({ customer_id: customer.id!, customer_name: customer.name!, unbilled_shipments: data.shipments.filter((shipment) => shipment.customer_id === customer.id && !data.invoices.some((invoice) => invoice.shipment_id === shipment.id)).length })),
        'latest-event': data.shipments.flatMap((shipment) => {
          const latest = data.shipment_events.filter((event) => event.shipment_id === shipment.id)
            .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)) || Number(b.id) - Number(a.id))[0];
          return latest ? [{ shipment_id: shipment.id!, event_id: latest.id!, status: latest.status!, occurred_at: latest.occurred_at! }] : [];
        }),
      };
      for (const challenge of challenges) {
        const reference = await db.query(challenge.referenceSql);
        expect(comparable(reference.rows), `${dataset.id}:${challenge.id}`).toEqual(expected[challenge.id]);
        expect(reference.fields.map((field) => ({ name: field.name, type: field.dataTypeID }))).toEqual(challenge.columns);
        const wrong = await db.query(challenge.wrongSql);
        if (JSON.stringify(comparable(reference.rows)) !== JSON.stringify(comparable(wrong.rows))) caughtWrong.add(challenge.id);
      }
      await expect(db.exec("INSERT INTO shipments (id, tracking_code, customer_id, route_id, status, booked_at, delivery_due) VALUES (9999, 'invalid', 9999, 1, 'queued', '2026-01-01', '2026-01-02')")).rejects.toThrow();
    }
    expect([...caughtWrong].sort()).toEqual(challenges.map((challenge) => challenge.id).sort());
  } finally {
    await db.close();
  }
}, 30_000);
