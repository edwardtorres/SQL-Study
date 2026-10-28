import { PGlite } from '@electric-sql/pglite';
import { describe, expect, test } from 'vitest';
import { challenges, datasetCatalog, generateSeed, schema, seedSql } from '../src/data';
import type { Cell, TableName } from '../src/data';

describe('fictional deterministic freight seeds', () => {
  test('same seed and variant produce byte-identical data and SQL; another seed changes data', () => {
    for (const dataset of datasetCatalog) {
      expect(JSON.stringify(generateSeed(dataset.seed, dataset.variant))).toBe(JSON.stringify(generateSeed(dataset.seed, dataset.variant)));
      expect(seedSql(dataset.seed, dataset.variant)).toBe(seedSql(dataset.seed, dataset.variant));
      expect(JSON.stringify(generateSeed(dataset.seed + 1, dataset.variant))).not.toBe(JSON.stringify(generateSeed(dataset.seed, dataset.variant)));
    }
    expect(() => generateSeed(Number.NaN)).toThrow(/safe integer/);
  });

  // Chapters 10 to 13 add staging and large tables; the eight core tables keep their keys and foreign keys.
  const EXTRA_TABLES = ['staging_scans', 'staging_customer_regions', 'load_watermark', 'staging_shipments_flat', 'shipment_scans_large'];
  const coreTables = schema.filter((table) => !EXTRA_TABLES.includes(table.name));
  test('every table in the seed has every declared column on every row, and the watermark has one row', () => {
    for (const dataset of datasetCatalog) {
      const data = generateSeed(dataset.seed, dataset.variant);
      for (const table of schema.filter((item) => item.name !== 'shipment_scans_large')) {
        for (const row of data[table.name]) {
          for (const column of table.columns) expect(column.name in row, `${dataset.id} ${table.name}.${column.name}`).toBe(true);
        }
      }
      expect(data.load_watermark, `${dataset.id} watermark`).toHaveLength(1);
    }
  });

  test('all eight core tables have unique primary keys and valid non-null foreign keys', () => {
    expect(coreTables).toHaveLength(8);
    for (const dataset of datasetCatalog) {
      const data = generateSeed(dataset.seed, dataset.variant);
      for (const table of coreTables) {
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

  test('step 2 edge datasets: boundary weights and dates, an empty invoice table, and missing text', () => {
    const boundary = generateSeed(181081, 'boundary');
    const queued = boundary.shipments.filter((row) => row.status === 'queued').map((row) => Number(row.weight_kg));
    expect(queued.filter((weight) => weight > 500).sort((a, b) => b - a)).toEqual([1200, 900, 700, 501]);
    expect(queued).toContain(500);
    expect(queued.filter((weight) => weight < 500).length).toBeGreaterThan(0);
    expect(boundary.shipments.some((row) => row.booked_at === '2026-01-31T00:00:00.000Z')).toBe(true);
    expect(boundary.shipments.some((row) => row.booked_at === '2026-01-31T23:59:59.999Z')).toBe(true);
    expect(boundary.shipments.some((row) => row.delivery_due === '2028-02-29')).toBe(true);

    expect(generateSeed(196613, 'empty').invoices).toEqual([]);

    const missing = generateSeed(214747, 'nulltext');
    expect(missing.customers.every((row) => row.region === null)).toBe(true);
    expect(missing.drivers.every((row) => row.supervisor_id === null)).toBe(true);
    expect(missing.shipment_events.every((row) => row.note === null)).toBe(true);
  });
});

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, cell]) => [key, comparable(cell)]));
  return value;
}

// Author validation against independent data algorithms. The blind review (blind-review.test.ts)
// checks the same tickets with a separate agent's solutions.
test('the real engine matches independent answers on every dataset, and every wrong variant is caught by at least two datasets', async () => {
  const db = await PGlite.create();
  const caught = new Map<string, number>();
  try {
    for (const dataset of datasetCatalog) {
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
        if (!challenge.datasets.some((item) => item.id === dataset.id)) continue;
        const reference = await db.query(challenge.referenceSql);
        expect(comparable(reference.rows), `${dataset.id}:${challenge.id}`).toEqual(expected[challenge.id]);
        expect(reference.fields.map((field) => ({ name: field.name, type: field.dataTypeID }))).toEqual(challenge.columns);
        for (const variant of challenge.wrongVariants) {
          const wrong = await db.query(variant.sql);
          const key = `${challenge.id}:${variant.id}`;
          const differs = JSON.stringify(comparable(reference.rows)) !== JSON.stringify(comparable(wrong.rows));
          caught.set(key, (caught.get(key) ?? 0) + (differs ? 1 : 0));
        }
      }
      await expect(db.exec("INSERT INTO shipments (id, tracking_code, customer_id, route_id, status, booked_at, delivery_due) VALUES (9999, 'invalid', 9999, 1, 'queued', '2026-01-01', '2026-01-02')")).rejects.toThrow();
    }
    for (const challenge of challenges) {
      for (const variant of challenge.wrongVariants) {
        expect(caught.get(`${challenge.id}:${variant.id}`) ?? 0, `${challenge.id}:${variant.id} caught by at least 2 datasets`).toBeGreaterThanOrEqual(2);
      }
    }
  } finally {
    await db.close();
  }
}, 60_000);
