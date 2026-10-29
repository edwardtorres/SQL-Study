import { describe, expect, test } from 'vitest';
import { items } from '../src/data/catalog';
import { itemTags } from '../src/data/itemTags';

// The tag index is generated from the catalog's wrong variants, so Daily Review can find tickets by tag without loading
// the chapter modules. This test recomputes it and fails on any drift.
describe('item tag index', () => {
  test('matches the mistake tags of every item in the catalog', () => {
    const computed = Object.fromEntries(items.map((item) => [item.id, [...new Set(item.wrongVariants.map((variant) => variant.mistake))].sort()]));
    expect(Object.keys(itemTags).sort()).toEqual(Object.keys(computed).sort());
    for (const [id, tags] of Object.entries(computed)) expect(itemTags[id], id).toEqual(tags);
  });
});
