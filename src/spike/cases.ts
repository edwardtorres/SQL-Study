export const spikeCases = [
  {
    name: 'CREATE TABLE',
    sql: `CREATE TABLE depots (id integer PRIMARY KEY, name text NOT NULL);
          CREATE TABLE loads (id integer PRIMARY KEY, depot_id integer REFERENCES depots(id), kg integer NOT NULL);`,
  },
  {
    name: 'INSERT',
    sql: `INSERT INTO depots VALUES (1, 'Alder'), (2, 'Birch');
          INSERT INTO loads VALUES (1, 1, 100), (2, 1, 200), (3, 2, 300);`,
  },
  {
    name: 'JOIN',
    sql: 'SELECT d.name, SUM(l.kg)::integer AS kg FROM depots d JOIN loads l ON l.depot_id = d.id GROUP BY d.name ORDER BY d.name',
    expected: [{ name: 'Alder', kg: 300 }, { name: 'Birch', kg: 300 }],
  },
  {
    name: 'CTE',
    sql: 'WITH heavy AS (SELECT * FROM loads WHERE kg >= 200) SELECT COUNT(*)::integer AS total FROM heavy',
    expected: [{ total: 2 }],
  },
  {
    name: 'Window function',
    sql: 'SELECT id, (ROW_NUMBER() OVER (PARTITION BY depot_id ORDER BY kg DESC, id))::integer AS position FROM loads ORDER BY id',
    expected: [{ id: 1, position: 2 }, { id: 2, position: 1 }, { id: 3, position: 1 }],
  },
  {
    name: 'INSERT ON CONFLICT',
    sql: 'INSERT INTO loads VALUES (1, 1, 150) ON CONFLICT (id) DO UPDATE SET kg = EXCLUDED.kg RETURNING id, kg',
    expected: [{ id: 1, kg: 150 }],
  },
  {
    name: 'MERGE',
    sql: `MERGE INTO loads l USING (VALUES (3, 350), (4, 400)) AS incoming(id, kg)
          ON l.id = incoming.id
          WHEN MATCHED THEN UPDATE SET kg = incoming.kg
          WHEN NOT MATCHED THEN INSERT (id, depot_id, kg) VALUES (incoming.id, 2, incoming.kg);
          SELECT id, kg FROM loads WHERE id >= 3 ORDER BY id;`,
    expected: [{ id: 3, kg: 350 }, { id: 4, kg: 400 }],
  },
] as const;
