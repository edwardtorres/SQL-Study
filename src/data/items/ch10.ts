import type { Challenge, CheckQuery, Policy } from '../../core/types';
import { datasetsFor } from '../datasets';

const CREATE_TABLE = 'https://www.postgresql.org/docs/18/sql-createtable.html';
const IDENTITY = 'https://www.postgresql.org/docs/18/ddl-identity-columns.html';
const INSERT = 'https://www.postgresql.org/docs/18/sql-insert.html';
const DOCS_DDL = [{ label: 'PostgreSQL CREATE TABLE', url: CREATE_TABLE }, { label: 'PostgreSQL identity columns', url: IDENTITY }];
const DOCS_LOAD = [{ label: 'PostgreSQL INSERT', url: INSERT }, { label: 'PostgreSQL identity columns', url: IDENTITY }];
const DISPATCH = { colleague: 'Nera Vale', colleagueRole: 'Dispatch coordinator' };
const PIPELINE = { colleague: 'Olin Moss', colleagueRole: 'Pipeline engineer' };
const CUSTOMERS = { colleague: 'Tamsin Rowe', colleagueRole: 'Customer success lead' };
const REPORTING = { colleague: 'Tarin Wren', colleagueRole: 'Reporting analyst' };

const DDL: Policy = { allow: ['CreateStmt'] };
const LOAD: Policy = { allow: ['CreateStmt', 'InsertStmt'] };

// Trusted state reads. Identity is part of the column read, so a typed-in key and a generated key differ.
const keysOf = (table: string): CheckQuery => ({
  id: `${table}-columns`, label: `Columns of ${table}`,
  sql: `SELECT column_name, data_type, is_identity, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '${table}' ORDER BY ordinal_position`,
});
const constraintsOf = (table: string): CheckQuery => ({
  id: `${table}-constraints`, label: `Constraints on ${table}`,
  sql: `SELECT contype::text AS kind, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = '${table}'::regclass ORDER BY kind, definition`,
});
const routeRows: CheckQuery = { id: 'dim-route-rows', label: 'Route pairs', sql: 'SELECT origin, destination FROM dim_route ORDER BY origin, destination' };
const customerRows: CheckQuery = { id: 'dim-customer-rows', label: 'Customer names', sql: 'SELECT customer_name FROM dim_customer ORDER BY customer_name' };

const DIM_ROUTE_DDL = 'CREATE TABLE dim_route (\n  route_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  origin text NOT NULL,\n  destination text NOT NULL,\n  UNIQUE (origin, destination)\n);';
const DIM_CUSTOMER_DDL = 'CREATE TABLE dim_customer (customer_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_name text NOT NULL UNIQUE);';
const FACT_SHIPMENT_DDL = 'CREATE TABLE fact_shipment (\n  tracking_code text PRIMARY KEY,\n  customer_key integer NOT NULL REFERENCES dim_customer (customer_key),\n  route_key integer NOT NULL REFERENCES dim_route (route_key),\n  weight_kg integer,\n  status text NOT NULL,\n  booked_at timestamptz NOT NULL\n);';

// Chapter 10: Model the warehouse. Dimensions, facts and surrogate keys are graded by the tables that the learner's statements leave behind.
export const chapter10Items: readonly Challenge[] = [
  {
    id: 'c10-g1', chapterId: 10, role: 'guided', starterStyle: 'blanks', title: 'A route dimension with a generated key',
    ...DISPATCH,
    summary: 'Create dim_route with a key the database generates, and a route pair that cannot repeat.',
    instructions: 'Create dim_route, the dimension that lists each origin and destination pair once. route_key is the surrogate key: the database generates it, and no one types it in. origin and destination are text and must be present. The blank is the clause that makes route_key generated.',
    starterSql: 'CREATE TABLE dim_route (\n  route_key integer ____ PRIMARY KEY,\n  origin text NOT NULL,\n  destination text NOT NULL,\n  UNIQUE (origin, destination)\n);',
    referenceSql: DIM_ROUTE_DDL,
    policy: DDL,
    checks: [keysOf('dim_route'), constraintsOf('dim_route')],
    columns: [],
    wrongVariants: [
      { id: 'g1-typed-key', mistake: 'IDENTITY_MISSING', sql: 'CREATE TABLE dim_route (\n  route_key integer PRIMARY KEY,\n  origin text NOT NULL,\n  destination text NOT NULL,\n  UNIQUE (origin, destination)\n);', explanation: 'It looks like the key was left as an ordinary integer. Without GENERATED ALWAYS AS IDENTITY, every row needs a route_key typed in by hand, and nothing gives a new route a fresh key. The ticket asks for a generated surrogate key.' },
      { id: 'g1-no-unique', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE dim_route (\n  route_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  origin text NOT NULL,\n  destination text NOT NULL\n);', explanation: 'It looks like the UNIQUE rule on origin and destination was left out. Then the same route pair can be stored many times, and the dimension stops listing each route once.' },
    ],
    ordered: true,
    hints: [
      'A surrogate key is one the database makes for you. Which clause on an integer column asks PostgreSQL to generate it?',
      'Write GENERATED ALWAYS AS IDENTITY after the integer type, before PRIMARY KEY.',
      'The blank is GENERATED ALWAYS AS IDENTITY. Leave the UNIQUE line as it is.',
    ],
    docs: DOCS_DDL,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-g2', chapterId: 10, role: 'guided', starterStyle: 'blanks', title: 'Load each route pair once',
    ...DISPATCH,
    summary: 'Build dim_route from the flat extract, one row for each origin and destination pair.',
    instructions: 'The flat extract has one row per shipment, so a route pair repeats for every shipment on it. dim_route must list each origin and destination pair once. Your script creates the table and loads it. The blank is the keyword that keeps each pair once.',
    starterSql: `${DIM_ROUTE_DDL}\nINSERT INTO dim_route (origin, destination)\nSELECT ____ origin, destination\nFROM staging_shipments_flat\nORDER BY origin, destination;`,
    referenceSql: `${DIM_ROUTE_DDL}\nINSERT INTO dim_route (origin, destination)\nSELECT DISTINCT origin, destination\nFROM staging_shipments_flat\nORDER BY origin, destination;`,
    policy: LOAD,
    checks: [routeRows],
    columns: [],
    wrongVariants: [
      { id: 'g2-no-distinct', mistake: 'DIMENSION_DUPLICATE', sql: `${DIM_ROUTE_DDL}\nINSERT INTO dim_route (origin, destination)\nSELECT origin, destination\nFROM staging_shipments_flat\nORDER BY origin, destination;`, explanation: 'It looks like DISTINCT was left out. Every shipment’s pair is inserted, so a repeated pair breaks the UNIQUE rule on origin and destination and the whole load fails. Removing repeats first is what lists each pair once.' },
      { id: 'g2-swapped', mistake: 'DIRECTION_SWAPPED', sql: `${DIM_ROUTE_DDL}\nINSERT INTO dim_route (origin, destination)\nSELECT DISTINCT destination, origin\nFROM staging_shipments_flat\nORDER BY destination, origin;`, explanation: 'It looks like the two columns were swapped in the SELECT. The table then stores each route backwards, so a destination becomes an origin. The insert lists origin first, so the SELECT must list origin first too.' },
    ],
    ordered: true,
    hints: [
      'A repeated pair would be stored twice. Which keyword keeps each distinct value once?',
      'Put DISTINCT right after SELECT. The insert lists origin first, then destination.',
      'The blank is DISTINCT.',
    ],
    docs: DOCS_LOAD,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-i1', chapterId: 10, role: 'independent', starterStyle: 'skeleton', title: 'A customer dimension with a generated key',
    ...CUSTOMERS,
    summary: 'Create dim_customer so the database generates each key, and no customer name repeats.',
    instructions: 'Create a table named dim_customer. customer_key is the surrogate key: an integer that is the primary key, which the database generates and that no statement may supply a value for. customer_name is the natural key: text, present, and unique across customers. Column names and types: customer_key (integer), customer_name (text). Write the table definition only.',
    starterSql: 'CREATE TABLE dim_customer ();\n',
    referenceSql: DIM_CUSTOMER_DDL,
    policy: DDL,
    checks: [keysOf('dim_customer'), constraintsOf('dim_customer')],
    constraintTests: [
      { name: 'typed-in key refused', sql: "INSERT INTO dim_customer (customer_key, customer_name) VALUES (50, 'Juniper Crate');", expect: 'error', sqlstate: '428C9' },
      { name: 'duplicate name rejected', sql: "INSERT INTO dim_customer (customer_name) VALUES ('Harbor Line'), ('Harbor Line');", expect: 'error', sqlstate: '23505' },
      { name: 'generated keys accepted', sql: "INSERT INTO dim_customer (customer_name) VALUES ('Ridge Freight'), ('Cedar Haul');", expect: 'ok' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i1-natural-pk', mistake: 'NATURAL_KEY_AS_SURROGATE', sql: 'CREATE TABLE dim_customer (customer_name text PRIMARY KEY);', explanation: 'It looks like the customer name became the primary key. A name is a natural key that can change or be shared, so there is no stable surrogate key for facts to point at. The ticket asks for a generated key that stays fixed.' },
      { id: 'i1-by-default', mistake: 'IDENTITY_BY_DEFAULT', sql: 'CREATE TABLE dim_customer (customer_key integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, customer_name text NOT NULL UNIQUE);', explanation: 'It looks like GENERATED BY DEFAULT was used. A default identity accepts a key typed in by hand, so a load could write a key that the sequence later repeats. GENERATED ALWAYS refuses that and keeps the key under the database’s control.' },
    ],
    ordered: true,
    hints: [
      'A surrogate key is never typed in by a loader. Which identity clause refuses a typed-in value?',
      'Use GENERATED ALWAYS AS IDENTITY for customer_key, and NOT NULL UNIQUE for customer_name.',
      'Reference: CREATE TABLE dim_customer (customer_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_name text NOT NULL UNIQUE);',
    ],
    docs: DOCS_DDL,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-i2', chapterId: 10, role: 'independent', starterStyle: 'skeleton', title: 'A shipment fact that points at its customer',
    ...REPORTING,
    summary: 'Create the customer dimension and the shipment fact, so each shipment row must name a known customer.',
    instructions: 'Create dim_customer as in the customer ticket: customer_key is the primary key, generated by the database and never supplied; customer_name is text, present and unique. Then create fact_shipment: tracking_code (text, the primary key), customer_key (integer, present, and must name a dim_customer row), weight_kg (integer, may be missing), status (text, present) and booked_at (timestamptz, present). Write both table definitions only.',
    starterSql: 'CREATE TABLE dim_customer ();\nCREATE TABLE fact_shipment ();\n',
    referenceSql: `${DIM_CUSTOMER_DDL}\nCREATE TABLE fact_shipment (\n  tracking_code text PRIMARY KEY,\n  customer_key integer NOT NULL REFERENCES dim_customer (customer_key),\n  weight_kg integer,\n  status text NOT NULL,\n  booked_at timestamptz NOT NULL\n);`,
    policy: DDL,
    checks: [keysOf('fact_shipment'), constraintsOf('fact_shipment')],
    constraintTests: [
      { name: 'unknown customer key rejected', sql: "INSERT INTO fact_shipment (tracking_code, customer_key, status, booked_at) VALUES ('JF-900001-0001', 999, 'queued', '2026-01-01T00:00:00Z');", expect: 'error', sqlstate: '23503' },
      { name: 'missing status rejected', sql: "WITH c AS (INSERT INTO dim_customer (customer_name) VALUES ('Harbor Line') RETURNING customer_key) INSERT INTO fact_shipment (tracking_code, customer_key, status, booked_at) SELECT 'JF-900001-0002', customer_key, NULL, '2026-01-01T00:00:00Z' FROM c;", expect: 'error', sqlstate: '23502' },
      { name: 'missing weight accepted', sql: "WITH c AS (INSERT INTO dim_customer (customer_name) VALUES ('Ridge Freight') RETURNING customer_key) INSERT INTO fact_shipment (tracking_code, customer_key, weight_kg, status, booked_at) SELECT 'JF-900001-0003', customer_key, NULL, 'queued', '2026-01-01T00:00:00Z' FROM c;", expect: 'ok' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i2-no-fk', mistake: 'CONSTRAINT_MISSING', sql: `${DIM_CUSTOMER_DDL}\nCREATE TABLE fact_shipment (\n  tracking_code text PRIMARY KEY,\n  customer_key integer NOT NULL,\n  weight_kg integer,\n  status text NOT NULL,\n  booked_at timestamptz NOT NULL\n);`, explanation: 'It looks like the REFERENCES clause was left out. A shipment can then name a customer key that does not exist, and the fact no longer ties to the dimension.' },
      { id: 'i2-weight-required', mistake: 'CONSTRAINT_TOO_STRICT', sql: `${DIM_CUSTOMER_DDL}\nCREATE TABLE fact_shipment (\n  tracking_code text PRIMARY KEY,\n  customer_key integer NOT NULL REFERENCES dim_customer (customer_key),\n  weight_kg integer NOT NULL,\n  status text NOT NULL,\n  booked_at timestamptz NOT NULL\n);`, explanation: 'It looks like weight_kg was made required. The ticket says a weight may be missing, and a shipment with no weight recorded is then refused.' },
    ],
    ordered: true,
    hints: [
      'A fact row must name a dimension row. Which clause on the column ties the two tables together?',
      'Write customer_key integer NOT NULL REFERENCES dim_customer (customer_key). Leave weight_kg without NOT NULL.',
      'Reference: the customer table as in the customer ticket, then the fact table with REFERENCES on customer_key.',
    ],
    docs: DOCS_DDL,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-i3', chapterId: 10, role: 'independent', starterStyle: 'skeleton', title: 'Load every customer name once',
    ...CUSTOMERS,
    summary: 'Create dim_customer and load each customer name in the flat extract exactly once.',
    instructions: 'Create dim_customer, as in the customer ticket, and load every distinct customer_name from staging_shipments_flat into it. The flat extract has many shipments per customer, and the table must hold each name once, with no name left out. Write the table and the load.',
    starterSql: 'CREATE TABLE dim_customer ();\n',
    referenceSql: `${DIM_CUSTOMER_DDL}\nINSERT INTO dim_customer (customer_name)\nSELECT DISTINCT customer_name FROM staging_shipments_flat ORDER BY customer_name;`,
    policy: LOAD,
    checks: [customerRows],
    columns: [],
    wrongVariants: [
      { id: 'i3-no-distinct', mistake: 'DIMENSION_DUPLICATE', sql: `${DIM_CUSTOMER_DDL}\nINSERT INTO dim_customer (customer_name)\nSELECT customer_name FROM staging_shipments_flat ORDER BY customer_name;`, explanation: 'It looks like DISTINCT was left out. Each customer has many shipments, so the same name is inserted many times, and the UNIQUE rule on customer_name rejects the load.' },
      { id: 'i3-limit', mistake: 'LIMIT_TRUNCATES', sql: `${DIM_CUSTOMER_DDL}\nINSERT INTO dim_customer (customer_name)\nSELECT DISTINCT customer_name FROM staging_shipments_flat ORDER BY customer_name LIMIT 5;`, explanation: 'It looks like a LIMIT was added. The flat extract has six customers, and the limit keeps five, so the last name is missing. A dimension load takes every distinct value, not a fixed number of them.' },
    ],
    ordered: true,
    hints: [
      'A dimension holds each name once, and the load must not leave any name out. Which keyword removes repeats?',
      'Use SELECT DISTINCT customer_name in the insert, with no row limit.',
      'Reference: CREATE TABLE dim_customer (...) as in the customer ticket, then INSERT ... SELECT DISTINCT customer_name FROM staging_shipments_flat.',
    ],
    docs: DOCS_LOAD,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-i4', chapterId: 10, role: 'independent', starterStyle: 'skeleton', title: 'Load the shipment star from the flat extract',
    ...PIPELINE,
    summary: 'Create two dimensions and the shipment fact, and load all three so each fact row points at its dimension keys.',
    instructions: 'Build the star from staging_shipments_flat, which names a customer, an origin and a destination on every row. dim_customer has customer_key (generated primary key) and customer_name (unique), and holds each name once. dim_route has route_key (generated primary key), origin and destination, and holds each origin and destination pair once. fact_shipment has one row per tracking_code, with customer_key and route_key (both present, each naming a dimension row), plus weight_kg (may be missing), status and booked_at. Write the three tables and their loads. Each dimension must be loaded before the fact.',
    starterSql: 'CREATE TABLE dim_customer ();\nCREATE TABLE dim_route ();\nCREATE TABLE fact_shipment ();\n',
    referenceSql: `${DIM_CUSTOMER_DDL}\n${DIM_ROUTE_DDL}\n${FACT_SHIPMENT_DDL}\nINSERT INTO dim_customer (customer_name) SELECT DISTINCT customer_name FROM staging_shipments_flat;\nINSERT INTO dim_route (origin, destination) SELECT DISTINCT origin, destination FROM staging_shipments_flat;\nINSERT INTO fact_shipment (tracking_code, customer_key, route_key, weight_kg, status, booked_at)\nSELECT f.tracking_code, c.customer_key, r.route_key, f.weight_kg, f.status, f.booked_at\nFROM staging_shipments_flat AS f\nJOIN dim_customer AS c ON c.customer_name = f.customer_name\nJOIN dim_route AS r ON r.origin = f.origin AND r.destination = f.destination;`,
    policy: LOAD,
    checks: [
      { id: 'star-facts', label: 'Shipments with their natural keys', sql: 'SELECT f.tracking_code, c.customer_name, r.origin, r.destination, f.weight_kg, f.status, f.booked_at FROM fact_shipment AS f JOIN dim_customer AS c ON c.customer_key = f.customer_key JOIN dim_route AS r ON r.route_key = f.route_key ORDER BY f.tracking_code' },
      { id: 'star-sizes', label: 'Dimension sizes', sql: 'SELECT (SELECT COUNT(*) FROM dim_customer)::integer AS customers, (SELECT COUNT(*) FROM dim_route)::integer AS routes' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'i4-swapped-route', mistake: 'DIRECTION_SWAPPED', sql: `${DIM_CUSTOMER_DDL}\n${DIM_ROUTE_DDL}\n${FACT_SHIPMENT_DDL}\nINSERT INTO dim_customer (customer_name) SELECT DISTINCT customer_name FROM staging_shipments_flat;\nINSERT INTO dim_route (origin, destination) SELECT DISTINCT origin, destination FROM staging_shipments_flat;\nINSERT INTO fact_shipment (tracking_code, customer_key, route_key, weight_kg, status, booked_at)\nSELECT f.tracking_code, c.customer_key, r.route_key, f.weight_kg, f.status, f.booked_at\nFROM staging_shipments_flat AS f\nJOIN dim_customer AS c ON c.customer_name = f.customer_name\nJOIN dim_route AS r ON r.origin = f.destination AND r.destination = f.origin;`, explanation: 'It looks like the route join matched origin to destination. The dimension stores each pair in the flat extract’s direction, so most shipments find no route and drop out of the fact.' },
      { id: 'i4-no-route', mistake: 'FACT_MISSING_KEY', sql: `${DIM_CUSTOMER_DDL}\n${DIM_ROUTE_DDL}\n${FACT_SHIPMENT_DDL}\nINSERT INTO dim_customer (customer_name) SELECT DISTINCT customer_name FROM staging_shipments_flat;\nINSERT INTO dim_route (origin, destination) SELECT DISTINCT origin, destination FROM staging_shipments_flat;\nINSERT INTO fact_shipment (tracking_code, customer_key, route_key, weight_kg, status, booked_at)\nSELECT f.tracking_code, c.customer_key, NULL, f.weight_kg, f.status, f.booked_at\nFROM staging_shipments_flat AS f\nJOIN dim_customer AS c ON c.customer_name = f.customer_name;`, explanation: 'It looks like the route was never looked up, so route_key is left empty. A fact row must point at a route, and the NOT NULL rule rejects the load.' },
    ],
    ordered: true,
    hints: [
      'Load the dimensions first, then the fact, which looks up each dimension key by its natural key.',
      'Join the flat extract to dim_customer on customer_name and to dim_route on origin and destination, then insert the keys.',
      'The reference is three CREATE TABLE statements, two dimension loads with DISTINCT, and one fact insert that joins both dimensions.',
    ],
    docs: DOCS_LOAD,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-b1-p1', chapterId: 10, role: 'boss', bossGroup: 'c10-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 1: design the arrival star',
    ...REPORTING,
    summary: 'Create a warehouse dimension and an arrival fact that points at it.',
    instructions: 'Create dim_warehouse with warehouse_key (generated surrogate key and primary key), warehouse_name (text, present, unique) and city (text, present). Create fact_arrival with arrival_key (generated surrogate key and primary key), warehouse_key (integer, present, and must name a dim_warehouse row), shipment_id (integer, present) and arrived_at (timestamptz, present). Write both table definitions only.',
    starterSql: 'CREATE TABLE dim_warehouse ();\nCREATE TABLE fact_arrival ();\n',
    referenceSql: 'CREATE TABLE dim_warehouse (warehouse_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_name text NOT NULL UNIQUE, city text NOT NULL);\nCREATE TABLE fact_arrival (arrival_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_key integer NOT NULL REFERENCES dim_warehouse (warehouse_key), shipment_id integer NOT NULL, arrived_at timestamptz NOT NULL);',
    policy: DDL,
    checks: [keysOf('dim_warehouse'), keysOf('fact_arrival'), constraintsOf('fact_arrival')],
    constraintTests: [
      { name: 'unknown warehouse rejected', sql: "INSERT INTO fact_arrival (warehouse_key, shipment_id, arrived_at) VALUES (999, 1, '2026-01-01T00:00:00Z');", expect: 'error', sqlstate: '23503' },
      { name: 'missing arrival time rejected', sql: "WITH w AS (INSERT INTO dim_warehouse (warehouse_name, city) VALUES ('Alder Hub', 'Valehaven') RETURNING warehouse_key) INSERT INTO fact_arrival (warehouse_key, shipment_id, arrived_at) SELECT warehouse_key, 1, NULL FROM w;", expect: 'error', sqlstate: '23502' },
      { name: 'arrival with a known warehouse accepted', sql: "WITH w AS (INSERT INTO dim_warehouse (warehouse_name, city) VALUES ('Birch Yard', 'Mossreach') RETURNING warehouse_key) INSERT INTO fact_arrival (warehouse_key, shipment_id, arrived_at) SELECT warehouse_key, 2, '2026-01-01T00:00:00Z' FROM w;", expect: 'ok' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'p1-no-fk', mistake: 'CONSTRAINT_MISSING', sql: 'CREATE TABLE dim_warehouse (warehouse_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_name text NOT NULL UNIQUE, city text NOT NULL);\nCREATE TABLE fact_arrival (arrival_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_key integer NOT NULL, shipment_id integer NOT NULL, arrived_at timestamptz NOT NULL);', explanation: 'It looks like the REFERENCES clause was left out of fact_arrival. An arrival can then name a warehouse that does not exist, so the fact no longer agrees with the dimension.' },
      { id: 'p1-name-key', mistake: 'NATURAL_KEY_AS_SURROGATE', sql: 'CREATE TABLE dim_warehouse (warehouse_name text PRIMARY KEY, city text NOT NULL);\nCREATE TABLE fact_arrival (arrival_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_key integer NOT NULL, shipment_id integer NOT NULL, arrived_at timestamptz NOT NULL);', explanation: 'It looks like the warehouse name became the key. The ticket asks for a generated warehouse_key, so the dimension has no surrogate key and the fact cannot point at it by a fixed number.' },
    ],
    ordered: true,
    hints: [
      'The design repeats the customer and fact pattern: a generated key on each table, and a foreign key from the fact.',
      'The dimension needs warehouse_key generated and warehouse_name unique. The fact needs REFERENCES on warehouse_key.',
      'Reference: dim_warehouse with a generated warehouse_key, then fact_arrival with arrival_key generated and warehouse_key referencing dim_warehouse.',
    ],
    docs: DOCS_DDL,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-b1-p2', chapterId: 10, role: 'boss', bossGroup: 'c10-boss', starterStyle: 'skeleton', title: 'Boss ticket, part 2: load the arrival star',
    ...REPORTING,
    summary: 'Create the arrival star and load it from the warehouse list and the shipment events.',
    instructions: 'Create dim_warehouse and fact_arrival as in part 1. Load dim_warehouse from warehouses, one row per warehouse, inserted in the order of warehouses.id. Load fact_arrival with one row per arrived event in shipment_events. Each arrival belongs to the warehouse that is the destination of the shipment’s route. Write both tables and both loads.',
    starterSql: 'CREATE TABLE dim_warehouse ();\nCREATE TABLE fact_arrival ();\n',
    referenceSql: 'CREATE TABLE dim_warehouse (warehouse_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_name text NOT NULL UNIQUE, city text NOT NULL);\nCREATE TABLE fact_arrival (arrival_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_key integer NOT NULL REFERENCES dim_warehouse (warehouse_key), shipment_id integer NOT NULL, arrived_at timestamptz NOT NULL);\nINSERT INTO dim_warehouse (warehouse_name, city) SELECT name, city FROM warehouses ORDER BY id;\nINSERT INTO fact_arrival (warehouse_key, shipment_id, arrived_at)\nSELECT w.warehouse_key, e.shipment_id, e.occurred_at\nFROM shipment_events AS e\nJOIN shipments AS s ON s.id = e.shipment_id\nJOIN routes AS r ON r.id = s.route_id\nJOIN warehouses AS dest ON dest.id = r.destination_id\nJOIN dim_warehouse AS w ON w.warehouse_name = dest.name\nWHERE e.status = \'arrived\';',
    policy: LOAD,
    checks: [
      { id: 'arrival-warehouses', label: 'Warehouses', sql: 'SELECT warehouse_name, city FROM dim_warehouse ORDER BY warehouse_name' },
      { id: 'arrival-rows', label: 'Arrivals with their warehouse name', sql: 'SELECT w.warehouse_name, f.shipment_id, f.arrived_at FROM fact_arrival AS f JOIN dim_warehouse AS w ON w.warehouse_key = f.warehouse_key ORDER BY w.warehouse_name, f.shipment_id' },
    ],
    columns: [],
    wrongVariants: [
      { id: 'p2-origin', mistake: 'DIRECTION_SWAPPED', sql: 'CREATE TABLE dim_warehouse (warehouse_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_name text NOT NULL UNIQUE, city text NOT NULL);\nCREATE TABLE fact_arrival (arrival_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_key integer NOT NULL REFERENCES dim_warehouse (warehouse_key), shipment_id integer NOT NULL, arrived_at timestamptz NOT NULL);\nINSERT INTO dim_warehouse (warehouse_name, city) SELECT name, city FROM warehouses ORDER BY id;\nINSERT INTO fact_arrival (warehouse_key, shipment_id, arrived_at)\nSELECT w.warehouse_key, e.shipment_id, e.occurred_at\nFROM shipment_events AS e\nJOIN shipments AS s ON s.id = e.shipment_id\nJOIN routes AS r ON r.id = s.route_id\nJOIN warehouses AS origin ON origin.id = r.origin_id\nJOIN dim_warehouse AS w ON w.warehouse_name = origin.name\nWHERE e.status = \'arrived\';', explanation: 'It looks like the route’s origin was used instead of its destination. Each arrival is then filed under the warehouse the shipment left, not the one it reached.' },
      { id: 'p2-all-events', mistake: 'FACT_GRAIN', sql: 'CREATE TABLE dim_warehouse (warehouse_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_name text NOT NULL UNIQUE, city text NOT NULL);\nCREATE TABLE fact_arrival (arrival_key integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, warehouse_key integer NOT NULL REFERENCES dim_warehouse (warehouse_key), shipment_id integer NOT NULL, arrived_at timestamptz NOT NULL);\nINSERT INTO dim_warehouse (warehouse_name, city) SELECT name, city FROM warehouses ORDER BY id;\nINSERT INTO fact_arrival (warehouse_key, shipment_id, arrived_at)\nSELECT w.warehouse_key, e.shipment_id, e.occurred_at\nFROM shipment_events AS e\nJOIN shipments AS s ON s.id = e.shipment_id\nJOIN routes AS r ON r.id = s.route_id\nJOIN warehouses AS dest ON dest.id = r.destination_id\nJOIN dim_warehouse AS w ON w.warehouse_name = dest.name;', explanation: 'It looks like the status filter was left out. Booked and loaded events are then loaded as arrivals, so the fact has more rows than the ticket’s grain of one arrival per shipment.' },
    ],
    ordered: true,
    hints: [
      'The fact’s grain is one row per arrival. Which events are arrivals?',
      'Filter shipment_events to status arrived, and join the shipment’s route destination to the dimension by warehouse name.',
      'Load the dimension in id order first. Then join events to shipments, routes, warehouses and the dimension, keeping only arrived events.',
    ],
    docs: DOCS_LOAD,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
  {
    id: 'c10-b1-p3', chapterId: 10, role: 'boss', bossGroup: 'c10-boss', starterStyle: 'blanks', title: 'Boss ticket, part 3: arrivals per destination warehouse',
    ...REPORTING,
    summary: 'Count arrival events per destination warehouse, and keep a warehouse with no arrivals in the list.',
    instructions: 'List every warehouse with the number of arrived events for shipments whose route ends there. A warehouse with no arrivals still appears, with 0. Order by warehouse name. The blank is the status text an arrival event carries.',
    starterSql: 'SELECT w.name AS warehouse, COUNT(e.id)::integer AS arrivals\nFROM warehouses AS w\nLEFT JOIN routes AS r ON r.destination_id = w.id\nLEFT JOIN shipments AS s ON s.route_id = r.id\nLEFT JOIN shipment_events AS e ON e.shipment_id = s.id AND e.status = ____\nGROUP BY w.name\nORDER BY w.name;',
    referenceSql: "SELECT w.name AS warehouse, COUNT(e.id)::integer AS arrivals\nFROM warehouses AS w\nLEFT JOIN routes AS r ON r.destination_id = w.id\nLEFT JOIN shipments AS s ON s.route_id = r.id\nLEFT JOIN shipment_events AS e ON e.shipment_id = s.id AND e.status = 'arrived'\nGROUP BY w.name\nORDER BY w.name;",
    columns: [{ name: 'warehouse', type: 25 }, { name: 'arrivals', type: 23 }],
    wrongVariants: [
      { id: 'p3-all-events', mistake: 'FACT_GRAIN', sql: "SELECT w.name AS warehouse, COUNT(e.id)::integer AS arrivals\nFROM warehouses AS w\nLEFT JOIN routes AS r ON r.destination_id = w.id\nLEFT JOIN shipments AS s ON s.route_id = r.id\nLEFT JOIN shipment_events AS e ON e.shipment_id = s.id\nGROUP BY w.name\nORDER BY w.name;", explanation: 'It looks like the status condition was dropped from the join. Every event counts, including booked and loaded events, so the totals are not arrivals.' },
      { id: 'p3-origin', mistake: 'DIRECTION_SWAPPED', sql: "SELECT w.name AS warehouse, COUNT(e.id)::integer AS arrivals\nFROM warehouses AS w\nLEFT JOIN routes AS r ON r.origin_id = w.id\nLEFT JOIN shipments AS s ON s.route_id = r.id\nLEFT JOIN shipment_events AS e ON e.shipment_id = s.id AND e.status = 'arrived'\nGROUP BY w.name\nORDER BY w.name;", explanation: 'It looks like the route was joined on its origin, not its destination. Arrivals are then counted at the warehouse the shipments left.' },
    ],
    ordered: true,
    hints: [
      'Count arrivals where the shipment’s route ends at the warehouse. Which route column names the destination?',
      'Keep the LEFT JOINs so a warehouse with no arrivals still appears, and put the status test in the join condition.',
      'The blank is the text \'arrived\'.',
    ],
    docs: DOCS_LOAD,
    datasets: datasetsFor(['nulls', 'boundary']),
  },
];
