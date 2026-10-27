import type { ColumnRule, QueryResult, ResultDiff } from '../core/types';

const NUMERIC_TYPES = new Set([20, 21, 23, 26, 700, 701, 1700]);
const ARRAY_ELEMENT_TYPES: Readonly<Record<number, number>> = { 1000: 16, 1005: 21, 1007: 23, 1016: 20, 1021: 700, 1022: 701, 1231: 1700, 1009: 25 };
export const MAX_DIFF_ROWS = 3;

/** Normalize the coefficient/exponent without rounding through JavaScript Number. */
function numeric(value: string | number | bigint): string {
  const text = String(value);
  if (/^[+]?infinity$/i.test(text)) return 'Infinity';
  if (/^-infinity$/i.test(text)) return '-Infinity';
  if (/^nan$/i.test(text)) return 'NaN';
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || (!match[2] && !match[3])) throw new Error('Invalid numeric result value.');
  const fraction = match[3] ?? '';
  let digits = `${match[2] ?? ''}${fraction}`.replace(/^0+/, '');
  if (!digits) return '0';
  const trimmed = digits.replace(/0+$/, '');
  const trailing = digits.length - trimmed.length;
  digits = trimmed;
  const power = BigInt(match[4] ?? '0') - BigInt(fraction.length) + BigInt(trailing);
  return `${match[1] === '-' ? '-' : ''}${digits}e${power}`;
}

function canonical(value: unknown, oid: number): unknown {
  if (value === null) return ['null'];
  if (value === undefined) return ['undefined'];
  if (NUMERIC_TYPES.has(oid) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')) {
    return ['numeric', numeric(value)];
  }
  if (value instanceof Date) return ['date', value.toISOString()];
  if (value instanceof Uint8Array) return ['bytes', Array.from(value)];
  if (Array.isArray(value)) return ['array', value.map((item) => canonical(item, ARRAY_ELEMENT_TYPES[oid] ?? 0))];
  if (typeof value === 'object') {
    return ['object', Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item, 0)])];
  }
  if (typeof value === 'bigint') return ['bigint', value.toString()];
  if (typeof value === 'number' && !Number.isFinite(value)) return ['number', String(value)];
  return [typeof value, value];
}

function rowKey(row: unknown[], result: QueryResult): string {
  return JSON.stringify(row.map((value, index) => canonical(value, result.fields[index]?.dataTypeID ?? 0)));
}

// Diffs reveal only a few bounded cells; they never return whole hidden fixtures.
function previewCell(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value !== null && typeof value === 'object') {
    const text = JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }
  return value;
}
function previewRow(row: unknown[]): unknown[] { return row.slice(0, 20).map(previewCell); }
function failure(message: string): ResultDiff { return { passed: false, message, missing: [], extra: [] }; }

/** True when two results hold the same rows: exact order when ordered, otherwise the same multiset. */
export function sameRows(actual: QueryResult, expected: QueryResult, ordered: boolean): boolean {
  try {
    const actualKeys = actual.rows.map((row) => rowKey(row, actual));
    const expectedKeys = expected.rows.map((row) => rowKey(row, expected));
    if (actualKeys.length !== expectedKeys.length) return false;
    if (!ordered) {
      actualKeys.sort();
      expectedKeys.sort();
    }
    return actualKeys.every((key, index) => key === expectedKeys[index]);
  } catch {
    return false;
  }
}

export function compareResults(actual: QueryResult, expected: QueryResult, options: { ordered: boolean; columns: readonly ColumnRule[] }): ResultDiff {
  const validColumns = (result: QueryResult): boolean => result.fields.length === options.columns.length && result.fields.every((field, index) => {
    const rule = options.columns[index];
    return rule !== undefined && field.name === rule.name && field.dataTypeID === rule.type;
  });
  if (!validColumns(expected)) return failure('Reference result does not meet the ticket column rules.');
  if (!validColumns(actual)) return failure('Columns must match the required names, order, and PostgreSQL types.');
  if ([...actual.rows, ...expected.rows].some((row) => row.length !== options.columns.length)) return failure('A result row has an unexpected number of columns.');
  try {
    const actualKeys = actual.rows.map((row) => rowKey(row, actual));
    const expectedKeys = expected.rows.map((row) => rowKey(row, expected));
    if (options.ordered) {
      const missing: unknown[][] = [];
      const extra: unknown[][] = [];
      let mismatches = 0;
      for (let index = 0; index < Math.max(actualKeys.length, expectedKeys.length); index += 1) {
        if (actualKeys[index] !== expectedKeys[index]) {
          mismatches += 1;
          const expectedRow = expected.rows[index];
          const actualRow = actual.rows[index];
          if (expectedRow && missing.length < MAX_DIFF_ROWS) missing.push(previewRow(expectedRow));
          if (actualRow && extra.length < MAX_DIFF_ROWS) extra.push(previewRow(actualRow));
        }
      }
      return { passed: mismatches === 0, message: mismatches === 0 ? 'Rows and required order match.' : `${mismatches} ordered row position(s) differ. Expected and received examples are shown.`, missing, extra };
    }
    const remaining = new Map<string, { count: number; row: unknown[] }>();
    for (const [index, key] of expectedKeys.entries()) {
      const prior = remaining.get(key);
      if (prior) prior.count += 1;
      else remaining.set(key, { count: 1, row: expected.rows[index]! });
    }
    const extra: unknown[][] = [];
    let extraCount = 0;
    for (const [index, key] of actualKeys.entries()) {
      const expectedEntry = remaining.get(key);
      if (expectedEntry && expectedEntry.count > 0) expectedEntry.count -= 1;
      else {
        extraCount += 1;
        if (extra.length < MAX_DIFF_ROWS) extra.push(previewRow(actual.rows[index]!));
      }
    }
    const missing: unknown[][] = [];
    let missingCount = 0;
    for (const entry of remaining.values()) {
      missingCount += entry.count;
      for (let count = 0; count < entry.count && missing.length < MAX_DIFF_ROWS; count += 1) missing.push(previewRow(entry.row));
    }
    return { passed: missingCount === 0 && extraCount === 0, message: missingCount === 0 && extraCount === 0 ? 'Rows match, including duplicate counts.' : `${missingCount} missing row(s); ${extraCount} extra row(s). Showing at most ${MAX_DIFF_ROWS} examples of each.`, missing, extra };
  } catch {
    return failure('A result value could not be compared without losing its type or precision.');
  }
}
