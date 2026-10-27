import { describe, expect, test } from 'vitest';
import type { ColumnRule, QueryResult } from '../src/core/types';
import { compareResults, MAX_DIFF_ROWS } from '../src/grader/compare';

function result(rows: unknown[][], type = 25, name = 'value'): QueryResult { return { fields: [{ name, dataTypeID: type }], rows }; }
function compare(actual: QueryResult, expected: QueryResult, ordered = false) {
  const columns: ColumnRule[] = expected.fields.map((field) => ({ name: field.name, type: field.dataTypeID }));
  return compareResults(actual, expected, { ordered, columns });
}

describe('typed result comparison', () => {
  test('multisets ignore order while preserving duplicate multiplicity', () => {
    expect(compare(result([['b'], ['a'], ['a']]), result([['a'], ['b'], ['a']])).passed).toBe(true);
    const diff = compare(result([['a'], ['b']]), result([['a'], ['a']]));
    expect(diff.passed).toBe(false);
    expect(diff.missing).toEqual([['a']]);
    expect(diff.extra).toEqual([['b']]);
  });
  test('ordered comparison rejects reordered ties and unequal lengths', () => {
    expect(compare(result([['a'], ['b']]), result([['a'], ['b']]), true).passed).toBe(true);
    const reordered = compare(result([['b'], ['a']]), result([['a'], ['b']]), true);
    expect(reordered.passed).toBe(false);
    expect(reordered.message).toContain('2 ordered row');
    expect(compare(result([['a']]), result([['a'], ['b']]), true).missing).toEqual([['b']]);
  });
  test('empty results match only empty results', () => {
    expect(compare(result([]), result([])).passed).toBe(true);
    expect(compare(result([]), result([]), true).passed).toBe(true);
    expect(compare(result([[null]]), result([])).passed).toBe(false);
    expect(compare(result([]), result([['a']])).missing).toEqual([['a']]);
  });
  test('SQL NULL is different from literal text and missing JavaScript values', () => {
    expect(compare(result([[null]]), result([[null]])).passed).toBe(true);
    expect(compare(result([['null']]), result([[null]])).passed).toBe(false);
    expect(compare(result([[undefined]]), result([[null]])).passed).toBe(false);
  });
  test('column names, column order, and PostgreSQL types are contractual', () => {
    expect(compare(result([[1]], 23, 'wrong'), result([[1]], 23, 'id')).passed).toBe(false);
    expect(compare(result([[1]], 20), result([[1]], 23)).passed).toBe(false);
    const expected = { fields: [{ name: 'id', dataTypeID: 23 }, { name: 'label', dataTypeID: 25 }], rows: [[1, 'a']] };
    expect(compare({ fields: [...expected.fields].reverse(), rows: [['a', 1]] }, expected).passed).toBe(false);
    expect(compareResults(expected, expected, { ordered: false, columns: [{ name: 'wrong', type: 23 }] }).message).toContain('Reference');
  });
  test('unexpected row width is reported rather than silently ignored', () => {
    expect(compare(result([[1, 2]], 23), result([[1]], 23)).message).toContain('number of columns');
  });
  test.each([20, 1700])('bigint/numeric OID %i retains precision past Number.MAX_SAFE_INTEGER', (type) => {
    expect(compare(result([['9007199254740993']], type), result([['9007199254740992']], type)).passed).toBe(false);
    expect(compare(result([['9007199254740993']], type), result([['9007199254740993']], type)).passed).toBe(true);
  });
  test.each([
    ['001.2300', '1.23'], ['123e-2', '1.230'], ['+0.00', '-0'], ['1000', '1e3'],
    ['0.0000000000000000001', '1e-19'], ['-12.3000', '-123e-1'], ['NaN', 'nan'], ['Infinity', '+infinity'],
  ])('numeric canonical forms %s and %s match exactly', (a, b) => {
    expect(compare(result([[a]], 1700), result([[b]], 1700)).passed).toBe(true);
  });
  test('decimal differences below JavaScript floating-point precision are detected', () => {
    expect(compare(result([['1.0000000000000000001']], 1700), result([['1.0000000000000000002']], 1700)).passed).toBe(false);
  });
  test('text remains text even when it looks numeric', () => {
    expect(compare(result([['01']]), result([['1']])).passed).toBe(false);
    expect(compare(result([[true]], 16), result([['true']], 16)).passed).toBe(false);
  });
  test('dates, byte arrays, numeric arrays and JSON objects compare deterministically', () => {
    expect(compare(result([[new Date('2026-01-01T00:00:00Z')]], 1184), result([[new Date('2025-12-31T19:00:00-05:00')]], 1184)).passed).toBe(true);
    expect(compare(result([[new Uint8Array([0, 255])]], 17), result([[new Uint8Array([0, 255])]], 17)).passed).toBe(true);
    expect(compare(result([[['1.00', null, '9007199254740993']]], 1231), result([[['1', null, '9007199254740993']]], 1231)).passed).toBe(true);
    expect(compare(result([[{ a: 1, b: null }]], 3802), result([[{ b: null, a: 1 }]], 3802)).passed).toBe(true);
  });
  test('diffs cap row count and cell length', () => {
    const diff = compare(result(Array.from({ length: 20 }, (_, i) => [`extra${i}${'x'.repeat(1000)}`])), result(Array.from({ length: 20 }, (_, i) => [`missing${i}${'y'.repeat(1000)}`])));
    expect(diff.missing).toHaveLength(MAX_DIFF_ROWS);
    expect(diff.extra).toHaveLength(MAX_DIFF_ROWS);
    expect(String(diff.missing[0]?.[0]).length).toBeLessThanOrEqual(121);
    expect(diff.message).toContain('20 missing');
    expect(diff.message).toContain('20 extra');
  });
  test('malformed numeric values fail closed', () => {
    expect(compare(result([['not numeric']], 1700), result([['1']], 1700)).message).toContain('precision');
  });
});
