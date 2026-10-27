import type { Variant } from '../core/types';

export type TableName = 'customers' | 'warehouses' | 'routes' | 'drivers' | 'shipments' | 'shipment_events' | 'invoices' | 'customer_versions';
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
  const data: FreightData = { customers: [], warehouses: [], routes: [], drivers: [], shipments: [], shipment_events: [], invoices: [], customer_versions: [] };
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
    const invoiceExists = variant === 'nulls' ? index % 4 === 0 : index % 7 !== 0;
    if (invoiceExists) {
      data.invoices.push({ id: data.invoices.length + 1, shipment_id: id, amount: index % 5 === 0 ? '90071992.01' : `${100 + integer(8) * 25}.00`, issued_at: timestamp(index * 2 + 3), paid_at: index % 3 === 0 ? null : timestamp(index * 2 + 20) });
    }
    if (index % 11 === 0) continue; // A real missing-event case, not a NULL placeholder event.
    const first = data.shipment_events.length + 1;
    const created = timestamp(index * 2);
    const latest = timestamp(index * 2 + 8);
    // Intentionally insert the latest event before the middle one: row order is not chronology.
    data.shipment_events.push({ id: first, shipment_id: id, status: 'booked', occurred_at: created, note: null });
    data.shipment_events.push({ id: first + 1, shipment_id: id, status: 'arrived', occurred_at: latest, note: index % 2 === 0 ? null : 'Synthetic scan' });
    data.shipment_events.push({ id: first + 2, shipment_id: id, status: 'loaded', occurred_at: timestamp(index * 2 + 4), note: 'Synthetic scan' });
    if (variant === 'ties' || index % 9 === 0) {
      data.shipment_events.push({ id: first + 3, shipment_id: id, status: 'delivered', occurred_at: latest, note: null });
    }
  }
  return data;
}

const tableConstraints: Partial<Record<TableName, readonly string[]>> = {
  routes: ['CHECK (origin_id <> destination_id)', 'CHECK (distance_km > 0)'],
  shipments: ['UNIQUE (tracking_code)', "CHECK (status IN ('queued', 'in_transit', 'delivered', 'cancelled'))", 'CHECK (weight_kg IS NULL OR weight_kg > 0)'],
  invoices: ['UNIQUE (shipment_id)', 'CHECK (amount >= 0)'],
  customer_versions: ['CHECK (valid_to IS NULL OR valid_to > valid_from)', 'UNIQUE (customer_id, valid_from)'],
};
const creationOrder: readonly TableName[] = ['customers', 'warehouses', 'drivers', 'routes', 'shipments', 'shipment_events', 'invoices', 'customer_versions'];
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
    const values = rows.map((row) => `(${table.columns.map((column) => literal(row[column.name] ?? null)).join(', ')})`).join(',\n');
    return `${ddl}\nINSERT INTO ${name} (${table.columns.map((column) => column.name).join(', ')}) VALUES\n${values};`;
  }).join('\n');
}
