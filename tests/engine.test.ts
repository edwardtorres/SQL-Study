import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';
import { spikeCases } from '../src/spike/cases';

test('the real PostgreSQL engine executes every spike case and checks returned rows', async () => {
  const db = await PGlite.create();
  try {
    for (const scenario of spikeCases) {
      const results = await db.exec(scenario.sql);
      if ('expected' in scenario) {
        expect(results.at(-1)?.rows, scenario.name).toEqual(scenario.expected);
      }
    }
  } finally {
    await db.close();
  }
}, 30_000);

test('fresh engines do not share tables or mutated state', async () => {
  const first = await PGlite.create();
  try {
    await first.exec('CREATE TABLE isolation_probe (id integer); INSERT INTO isolation_probe VALUES (1)');
  } finally {
    await first.close();
  }
  const second = await PGlite.create();
  try {
    await expect(second.query('SELECT * FROM isolation_probe')).rejects.toThrow(/does not exist/);
  } finally {
    await second.close();
  }
}, 30_000);
