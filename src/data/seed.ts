import type { Variant } from '../core/types';

export type TableName = 'customers' | 'warehouses' | 'routes' | 'drivers' | 'shipments' | 'shipment_events' | 'invoices' | 'customer_versions'
  | 'staging_scans' | 'staging_customer_regions' | 'load_watermark' | 'staging_shipments_flat' | 'shipment_scans_large';
export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type FreightData = Record<TableName, Row[]>;
export interface ColumnSpec { name: string; type: string; nullable: boolean; primaryKey?: boolean; references?: string }
export interface TableSpec { name: TableName; description: string; columns: readonly ColumnSpec[] }

export const schema: readonly TableSpec[] = [
  { name: 'customers', description: 'One fictional customer per row. Some customers have no shipments.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: false }, { name: 'region', type: 'text', nullable: true },
  ] },
  { name: 'warehouses', description: 'Origin and destination warehouse locations.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: false }, { name: 'city', type: 'text', nullable: false },
  ] },
  { name: 'routes', description: 'Directed warehouse-to-warehouse routes.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'origin_id', type: 'integer', nullable: false, references: 'warehouses.id' },
    { name: 'destination_id', type: 'integer', nullable: false, references: 'warehouses.id' },
    { name: 'distance_km', type: 'integer', nullable: false },
  ] },
  { name: 'drivers', description: 'Invented drivers; NULL supervisor means no assigned supervisor.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: false },
    { name: 'supervisor_id', type: 'integer', nullable: true, references: 'drivers.id' },
  ] },
  { name: 'shipments', description: 'One shipment per row; weight and driver assignment may be missing.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'tracking_code', type: 'text', nullable: false },
    { name: 'customer_id', type: 'integer', nullable: false, references: 'customers.id' },
    { name: 'route_id', type: 'integer', nullable: false, references: 'routes.id' },
    { name: 'driver_id', type: 'integer', nullable: true, references: 'drivers.id' },
    { name: 'status', type: 'text', nullable: false },
    { name: 'weight_kg', type: 'integer', nullable: true },
    { name: 'booked_at', type: 'timestamptz', nullable: false },
    { name: 'delivery_due', type: 'date', nullable: false },
  ] },
  { name: 'shipment_events', description: 'Many events per shipment. The largest event ID wins timestamp ties.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'shipment_id', type: 'integer', nullable: false, references: 'shipments.id' },
    { name: 'status', type: 'text', nullable: false },
    { name: 'occurred_at', type: 'timestamptz', nullable: false },
    { name: 'note', type: 'text', nullable: true },
  ] },
  { name: 'invoices', description: 'At most one invoice per shipment; repeated amounts are legitimate.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'shipment_id', type: 'integer', nullable: false, references: 'shipments.id' },
    { name: 'amount', type: 'numeric(12,2)', nullable: false },
    { name: 'issued_at', type: 'timestamptz', nullable: false },
    { name: 'paid_at', type: 'timestamptz', nullable: true },
  ] },
  { name: 'customer_versions', description: 'Customer region history for later slowly changing dimension tickets.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'customer_id', type: 'integer', nullable: false, references: 'customers.id' },
    { name: 'region', type: 'text', nullable: true },
    { name: 'valid_from', type: 'timestamptz', nullable: false },
    { name: 'valid_to', type: 'timestamptz', nullable: true },
  ] },
  { name: 'staging_scans', description: 'Scans landed by the feed, not yet loaded. Holds duplicates, orphaned shipment ids and NULLs on purpose.', columns: [
    { name: 'id', type: 'integer', nullable: true },
    { name: 'shipment_id', type: 'integer', nullable: true },
    { name: 'status', type: 'text', nullable: true },
    { name: 'occurred_at', type: 'timestamptz', nullable: true },
  ] },
  { name: 'staging_customer_regions', description: 'Region changes landed by the feed, in arrival order. One customer id is unknown.', columns: [
    { name: 'customer_id', type: 'integer', nullable: true },
    { name: 'region', type: 'text', nullable: true },
    { name: 'changed_at', type: 'timestamptz', nullable: true },
  ] },
  { name: 'load_watermark', description: 'One row: the newest scan time that earlier loads have already taken.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'last_loaded_at', type: 'timestamptz', nullable: false },
  ] },
  { name: 'staging_shipments_flat', description: 'A flat extract of shipments with customer and route names, for the star schema tickets.', columns: [
    { name: 'tracking_code', type: 'text', nullable: true },
    { name: 'customer_name', type: 'text', nullable: true },
    { name: 'origin', type: 'text', nullable: true },
    { name: 'destination', type: 'text', nullable: true },
    { name: 'weight_kg', type: 'integer', nullable: true },
    { name: 'status', type: 'text', nullable: true },
    { name: 'booked_at', type: 'timestamptz', nullable: true },
  ] },
  { name: 'shipment_scans_large', description: 'Twenty thousand scans generated by a fixed formula, so query plans are stable. Indexed by its primary key only.', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'shipment_id', type: 'integer', nullable: false },
    { name: 'status', type: 'text', nullable: false },
    { name: 'occurred_at', type: 'timestamptz', nullable: false },
  ] },
];

// Mulberry32: all random decisions use this explicitly seeded, reproducible PRNG.
function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const baseDate = Date.UTC(2025, 11, 28);
function timestamp(hours: number): string { return new Date(baseDate + hours * 3_600_000).toISOString(); }
function dateAfter(days: number): string { return new Date(baseDate + days * 86_400_000).toISOString().slice(0, 10); }

export function generateSeed(seed: number, variant: Variant = 'sample'): FreightData {
  if (!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer.');
  const random = randomSource(seed);
  const integer = (maximum: number) => Math.floor(random() * maximum);
  const data: FreightData = { customers: [], warehouses: [], routes: [], drivers: [], shipments: [], shipment_events: [], invoices: [], customer_versions: [], staging_scans: [], staging_customer_regions: [], load_watermark: [], staging_shipments_flat: [], shipment_scans_large: [] };
  const customerNames = ['Aster Loomworks', 'Brindle Pantry', 'Cobalt Paperworks', 'Dovetail Lanterns', 'Emberwood Games', 'Fable Orchard', 'Glimmer Clayworks', 'Hearthline Notions'];
  for (let index = 0; index < customerNames.length; index += 1) {
    const id = index + 1;
    data.customers.push({ id, name: customerNames[index]!, region: index % 3 === 0 ? null : ['North', 'South', 'West'][index % 3]! });
    data.customer_versions.push({ id: id * 2 - 1, customer_id: id, region: 'North', valid_from: '2025-01-01T00:00:00.000Z', valid_to: '2025-07-01T00:00:00.000Z' });
    data.customer_versions.push({ id: id * 2, customer_id: id, region: data.customers[index]!.region!, valid_from: '2025-07-01T00:00:00.000Z', valid_to: null });
  }
  const warehouseNames = ['Alder Hub', 'Birch Yard', 'Cedar Dock', 'Dahlia Terminal'];
  for (let index = 0; index < warehouseNames.length; index += 1) {
    data.warehouses.push({ id: index + 1, name: warehouseNames[index]!, city: ['Valehaven', 'Mossreach', 'Cloudmere', 'Reedford'][index]! });
    data.drivers.push({ id: index + 1, name: ['Nera Vale', 'Olin Moss', 'Pella Reed', 'Tarin Wren'][index]!, supervisor_id: index === 0 ? null : 1 });
  }
  for (let index = 0; index < 6; index += 1) {
    const origin = index % 4 + 1;
    data.routes.push({ id: index + 1, origin_id: origin, destination_id: origin % 4 + 1, distance_km: 80 + integer(600) });
  }
  const count = variant === 'sample' ? 240 : variant === 'nulls' ? 120 : 180;
  const nullText = variant === 'nulltext';
  const statuses = ['queued', 'in_transit', 'delivered', 'cancelled'];
  for (let index = 0; index < count; index += 1) {
    const id = index + 1;
    let status: string = statuses[integer(statuses.length)]!;
    let weight: number | null = index % 19 === 0 ? null : 100 + integer(1901);
    if (index < 3) { status = 'queued'; weight = [499, 500, 501][index]!; }
    if (variant === 'nulls') status = 'delivered'; // The beginner ticket must return an empty result here.
    if (variant === 'ties') { status = index < 6 ? 'queued' : 'delivered'; weight = index < 6 ? 500 : weight; }
    data.shipments.push({
      id, tracking_code: `JF-${String(seed >>> 0).padStart(6, '0')}-${String(id).padStart(4, '0')}`,
      customer_id: index % 6 + 1, // IDs 7 and 8 deliberately have no shipments.
      route_id: index % 6 + 1,
      driver_id: index % (variant === 'nulls' ? 2 : 7) === 0 ? null : integer(4) + 1,
      status, weight_kg: weight, booked_at: timestamp(index * 2), delivery_due: dateAfter(3 + index % 12),
    });
    // At least one unbilled shipment for every active customer; others have invoices.
    const invoiceExists = variant === 'empty' ? false : variant === 'nulls' ? index % 4 === 0 : index % 7 !== 0;
    if (invoiceExists) {
      data.invoices.push({ id: data.invoices.length + 1, shipment_id: id, // Every fifth invoice is realistic, and that branch draws no random number, so other seed data is unchanged.
      // The precision variant keeps a 90,071,992.01 amount to test exact numeric sums against float rounding.
      amount: index % 5 === 0 ? (variant === 'precision' ? '90071992.01' : `${100 + ((index * 7) % 8) * 25}.00`) : `${100 + integer(8) * 25}.00`, issued_at: timestamp(index * 2 + 3), paid_at: index % 3 === 0 ? null : timestamp(index * 2 + 20) });
    }
    if (index % 11 === 0) continue; // A real missing-event case, not a NULL placeholder event.
    const first = data.shipment_events.length + 1;
    const created = timestamp(index * 2);
    const latest = timestamp(index * 2 + 8);
    // Intentionally insert the latest event before the middle one: row order is not chronology.
    data.shipment_events.push({ id: first, shipment_id: id, status: 'booked', occurred_at: created, note: null });
    data.shipment_events.push({ id: first + 1, shipment_id: id, status: 'arrived', occurred_at: latest, note: nullText || index % 2 === 0 ? null : 'Synthetic scan' });
    data.shipment_events.push({ id: first + 2, shipment_id: id, status: 'loaded', occurred_at: timestamp(index * 2 + 4), note: nullText ? null : 'Synthetic scan' });
    if (variant === 'ties' || index % 9 === 0) {
      data.shipment_events.push({ id: first + 3, shipment_id: id, status: 'delivered', occurred_at: latest, note: null });
    }
  }
  if (nullText) {
    for (const customer of data.customers) customer.region = null;
    for (const driver of data.drivers) driver.supervisor_id = null;
  }
  // Shared boundary timestamps: BETWEEN with a date-only end misses the last instant of a day.
  data.shipments[0]!.booked_at = '2026-01-31T00:00:00.000Z';
  data.shipments[1]!.booked_at = '2026-01-31T23:59:59.999Z';
  if (variant === 'boundary') applyBoundary(data);
  addStaging(data);
  return data;
}

// Staging extracts for chapters 10 to 13. Built by index arithmetic only, so the existing seed data is unchanged.
function addStaging(data: FreightData): void {
  data.staging_scans = Array.from({ length: 40 }, (_, index) => ({
    id: 1000 + index,
    shipment_id: index % 9 === 0 ? 9000 + index : ((index * 17) % 240) + 1,
    status: index % 11 === 5 ? null : ['booked', 'loaded', 'arrived', 'delivered'][index % 4]!,
    // Scans 0 to 5 are already loaded; scan 6 sits exactly on the watermark, so it is not newer; the rest are new.
    occurred_at: timestamp(468 + index * 2),
  }));
  // The feed sent scan 1007 twice: index 8 repeats index 7, so a load must keep one copy.
  data.staging_scans[8] = { ...data.staging_scans[7]! };
  data.staging_customer_regions = [
    { customer_id: 2, region: 'East', changed_at: timestamp(480) },
    { customer_id: 4, region: 'West', changed_at: timestamp(490) },
    { customer_id: 6, region: 'North', changed_at: timestamp(500) },
    { customer_id: 2, region: 'South', changed_at: timestamp(520) },
    { customer_id: 99, region: 'Central', changed_at: timestamp(530) },
  ];
  data.load_watermark = [{ id: 1, last_loaded_at: timestamp(480) }];
  data.staging_shipments_flat = data.shipments.slice(0, 60).map((shipment) => {
    const customer = data.customers[Number(shipment.customer_id) - 1]!;
    const route = data.routes[Number(shipment.route_id) - 1]!;
    const origin = data.warehouses[Number(route.origin_id) - 1]!;
    const destination = data.warehouses[Number(route.destination_id) - 1]!;
    return { tracking_code: shipment.tracking_code ?? null, customer_name: customer.name ?? null, origin: origin.name ?? null, destination: destination.name ?? null, weight_kg: shipment.weight_kg ?? null, status: shipment.status ?? null, booked_at: shipment.booked_at ?? null };
  });
}

// Boundary dataset: the first five queued shipments weigh 1200, 900, 700, 501 and exactly 500 kg,
// and every other queued shipment weighs under 500 kg. Two shipments have boundary timestamps and one
// has the leap-day due date.
function applyBoundary(data: FreightData): void {
  const heavy = [1200, 900, 700, 501, 500];
  let next = 0;
  data.shipments.forEach((shipment, index) => {
    if (shipment.status !== 'queued') return;
    shipment.weight_kg = next < heavy.length ? heavy[next]! : 100 + ((index * 37) % 400);
    next += 1;
  });
  data.shipments[2]!.delivery_due = '2028-02-29';
}

const tableConstraints: Partial<Record<TableName, readonly string[]>> = {
  routes: ['CHECK (origin_id <> destination_id)', 'CHECK (distance_km > 0)'],
  shipments: ['UNIQUE (tracking_code)', "CHECK (status IN ('queued', 'in_transit', 'delivered', 'cancelled'))", 'CHECK (weight_kg IS NULL OR weight_kg > 0)'],
  invoices: ['UNIQUE (shipment_id)', 'CHECK (amount >= 0)'],
  customer_versions: ['CHECK (valid_to IS NULL OR valid_to > valid_from)', 'UNIQUE (customer_id, valid_from)'],
};
const creationOrder: readonly TableName[] = ['customers', 'warehouses', 'drivers', 'routes', 'shipments', 'shipment_events', 'invoices', 'customer_versions', 'staging_scans', 'staging_customer_regions', 'load_watermark', 'staging_shipments_flat'];
// The large scans table is built in SQL, not as rows: 20,000 generated rows would make the seed text too large.
const LARGE_SCANS_SQL = `CREATE TABLE shipment_scans_large (id integer PRIMARY KEY, shipment_id integer NOT NULL, status text NOT NULL, occurred_at timestamptz NOT NULL);\nINSERT INTO shipment_scans_large (id, shipment_id, status, occurred_at)\nSELECT g, (g * 7919) % 5000 + 1, (ARRAY['booked', 'loaded', 'arrived', 'delivered'])[1 + g % 4], timestamptz '2026-01-01 00:00:00+00' + g * interval '1 minute'\nFROM generate_series(1, 20000) AS g;\nANALYZE;`;
function literal(value: Cell): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Seed numbers must be finite.');
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

export function seedSql(seed: number, variant: Variant = 'sample'): string {
  const data = generateSeed(seed, variant);
  return creationOrder.map((name) => {
    const table = schema.find((item) => item.name === name)!;
    const columns = table.columns.map((column) => `${column.name} ${column.type}${column.nullable ? '' : ' NOT NULL'}${column.primaryKey ? ' PRIMARY KEY' : ''}${column.references ? ` REFERENCES ${column.references.replace('.', '(')})` : ''}`);
    const ddl = `CREATE TABLE ${name} (${[...columns, ...(tableConstraints[name] ?? [])].join(', ')});`;
    const rows = data[name];
    // An empty table (the Step 2 'empty' dataset) keeps its CREATE TABLE; a VALUES list needs at least one row.
    if (rows.length === 0) return ddl;
    const values = rows.map((row) => `(${table.columns.map((column) => literal(row[column.name] ?? null)).join(', ')})`).join(',\n');
    return `${ddl}\nINSERT INTO ${name} (${table.columns.map((column) => column.name).join(', ')}) VALUES\n${values};`;
  }).join('\n') + `\n${LARGE_SCANS_SQL}`;
}
