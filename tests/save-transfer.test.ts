import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { applySubmission, localDay } from '../src/game/rules';
import { emptySave, type SaveV4 } from '../src/save/progress';
import { exportSave, importSave } from '../src/save/transfer';

const v2Text = readFileSync(new URL('./fixtures/save-v2.json', import.meta.url), 'utf8');

function someProgress(): SaveV4 {
  const at = Date.parse('2026-03-02T12:00:00Z');
  return applySubmission(emptySave(), itemIndex, itemIndex.find((candidate) => candidate.id === 'c1-i1')!, 'SELECT reference FROM shipments', {
    passed: true, sql: 'SELECT 1', at, day: localDay(at, 'UTC'),
  }).save;
}

describe('progress export and import', () => {
  test('an exported save imports back to the same progress', () => {
    const save = someProgress();
    const result = importSave(exportSave(save), itemIndex);
    expect(result).toEqual({ ok: true, save, status: 'restored' });
  });

  test('a version 2 file imports as a migrated version 4 save', () => {
    const result = importSave(v2Text, itemIndex);
    expect(result).toMatchObject({ ok: true, status: 'migrated' });
    if (result.ok) expect(result.save.version).toBe(4);
  });

  test('a file that is not JSON is refused with a reason, and nothing is replaced', () => {
    expect(importSave('not a save', itemIndex)).toEqual({ ok: false, reason: 'This file is not a valid progress save. Your progress is unchanged.' });
  });

  test('a save from a newer version is refused', () => {
    expect(importSave('{"version":5,"tickets":{}}', itemIndex)).toMatchObject({ ok: false });
  });

  test('a file that is too large is refused before it is parsed', () => {
    expect(importSave(' '.repeat(2_000_001), itemIndex)).toMatchObject({ ok: false });
  });
});
