import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { generateSeed, seedSql } from '../src/data/seed';
import type { Variant } from '../src/core/types';

// Written from the ticket specifications before opening the author's solutions.
const blindSolutions = {
  dispatch: `SELECT id, tracking_code, weight_kg
    FROM shipments
    WHERE status = 'queued' AND weight_kg >= 500
    ORDER BY weight_kg DESC, id ASC LIMIT 5;`,
  unbilled: `SELECT c.id AS customer_id, c.name AS customer_name,
    (SELECT COUNT(*)::integer FROM shipments s
     WHERE s.customer_id = c.id
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.shipment_id = s.id)) AS unbilled_shipments
    FROM customers c ORDER BY c.id;`,
  'latest-event': `SELECT shipment_id, event_id, status, occurred_at
    FROM (
      SELECT shipment_id, id AS event_id, status, occurred_at,
        ROW_NUMBER() OVER (PARTITION BY shipment_id ORDER BY occurred_at DESC, id DESC) AS scan_number
      FROM shipment_events
    ) scans WHERE scan_number = 1 ORDER BY shipment_id;`,
};
const fixtures: { id: string; seed: number; variant: Variant }[] = [
  { id: 'sample', seed: 104729, variant: 'sample' },
  { id: 'nulls', seed: 130363, variant: 'nulls' },
  { id: 'ties', seed: 155921, variant: 'ties' },
];
let db: PGlite;
beforeAll(async () => {
  db = await PGlite.create();
  for (const fixture of fixtures) {
    await db.exec(`CREATE SCHEMA blind_${fixture.id}; SET search_path TO blind_${fixture.id};`);
    await db.exec(seedSql(fixture.seed, fixture.variant));
  }
}, 30_000);
afterAll(async () => { await db?.close(); });
const normalize = (value: unknown): unknown => value instanceof Date ? value.toISOString()
  : Array.isArray(value) ? value.map(normalize) : value;

describe('independent blind content review', () => {
  for (const fixture of fixtures) {
    test(`blind solutions agree with independent data algorithms: ${fixture.id}`, async () => {
      await db.exec(`SET search_path TO blind_${fixture.id};`);
      const data = generateSeed(fixture.seed, fixture.variant);
      const dispatch = await db.query<unknown[]>(blindSolutions.dispatch, [], { rowMode: 'array' });
      const expectedDispatch = data.shipments.filter((shipment) => shipment.status === 'queued' && typeof shipment.weight_kg === 'number' && shipment.weight_kg >= 500)
        .sort((a, b) => Number(b.weight_kg) - Number(a.weight_kg) || Number(a.id) - Number(b.id))
        .slice(0, 5).map((shipment) => [shipment.id, shipment.tracking_code, shipment.weight_kg]);
      expect(dispatch.rows).toEqual(expectedDispatch);
      expect(dispatch.fields.map((field) => field.dataTypeID)).toEqual([23, 25, 23]);

      const billed = new Set(data.invoices.map((invoice) => invoice.shipment_id));
      const expectedUnbilled = data.customers.map((customer) => [customer.id, customer.name,
        data.shipments.filter((shipment) => shipment.customer_id === customer.id && !billed.has(shipment.id!)).length,
      ]);
      const unbilled = await db.query<unknown[]>(blindSolutions.unbilled, [], { rowMode: 'array' });
      expect(unbilled.rows).toEqual(expectedUnbilled);
      expect(unbilled.fields.map((field) => field.dataTypeID)).toEqual([23, 25, 23]);

      const latest = new Map<number, Record<string, string | number | null>>();
      for (const event of data.shipment_events) {
        const key = Number(event.shipment_id);
        const previous = latest.get(key);
        if (!previous || String(event.occurred_at) > String(previous.occurred_at)
            || (event.occurred_at === previous.occurred_at && Number(event.id) > Number(previous.id))) latest.set(key, event);
      }
      const expectedLatest = [...latest.values()].sort((a, b) => Number(a.shipment_id) - Number(b.shipment_id))
        .map((event) => [event.shipment_id, event.id, event.status, event.occurred_at]);
      const actualLatest = await db.query<unknown[]>(blindSolutions['latest-event'], [], { rowMode: 'array' });
      expect(normalize(actualLatest.rows)).toEqual(expectedLatest);
      expect(actualLatest.fields.map((field) => field.dataTypeID)).toEqual([23, 23, 25, 1184]);
    });
  }
});

// Added only after the three blind-solution tests above had executed and passed.
describe('post-blind review of author references and examples', () => {
  test('references match independently solved tickets on every fixture and wrong variants are caught', async () => {
    const { challenges } = await import('../src/data/challenges');
    const wrongDetected = new Set<string>();
    for (const fixture of fixtures) {
      await db.exec(`SET search_path TO blind_${fixture.id};`);
      for (const challenge of challenges) {
        const own = await db.query<unknown[]>(blindSolutions[challenge.id as keyof typeof blindSolutions], [], { rowMode: 'array' });
        const reference = await db.query<unknown[]>(challenge.referenceSql, [], { rowMode: 'array' });
        expect(normalize(reference.rows), `${fixture.id}: ${challenge.id}`).toEqual(normalize(own.rows));
        expect(reference.fields.map((field) => ({ name: field.name, type: field.dataTypeID }))).toEqual(challenge.columns);
        const wrong = await db.query<unknown[]>(challenge.wrongSql, [], { rowMode: 'array' });
        if (JSON.stringify(normalize(wrong.rows)) !== JSON.stringify(normalize(reference.rows))) wrongDetected.add(challenge.id);
        await expect(db.query(challenge.exampleSql)).resolves.toBeDefined();
      }
    }
    expect([...wrongDetected].sort()).toEqual(['dispatch', 'latest-event', 'unbilled']);
  });
});
