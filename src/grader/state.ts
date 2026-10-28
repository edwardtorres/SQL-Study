import { compareResults, sameRows } from './compare';
import type { ResultDiff } from '../core/types';
import type { StateResult } from '../engine/runtime';

// Learner feedback names each failing check or constraint test. A learner error is reported as it is.
export function stateDiff(actual: StateResult, expected: StateResult): ResultDiff {
  if (actual.learnerError !== null) return { passed: false, message: actual.learnerError, missing: [], extra: [] };
  const problems: string[] = [];
  let firstRows = null as ResultDiff | null; // assigned inside the forEach below
  actual.checks.forEach((check, index) => {
    const reference = expected.checks[index]?.result;
    if (check.result === null || check.error !== null) {
      problems.push(`${check.label}: ${check.error ?? 'no result'}`);
      return;
    }
    if (!reference) {
      problems.push(`${check.label}: the reference could not be checked.`);
      return;
    }
    const columns = reference.fields.map((field) => ({ name: field.name, type: field.dataTypeID }));
    const diff = compareResults(check.result, reference, { ordered: true, columns });
    if (!diff.passed) {
      problems.push(`${check.label}: ${diff.message}`);
      firstRows ??= diff;
    }
  });
  // An idempotent ticket also checks the state after its statements run a second time.
  actual.rerunChecks?.forEach((check, index) => {
    const reference = expected.rerunChecks?.[index]?.result;
    if (check.result === null || check.error !== null) {
      problems.push(`${check.label} after a second run: ${check.error ?? 'no result'}`);
      return;
    }
    if (!reference) {
      problems.push(`${check.label} after a second run: the reference could not be checked.`);
      return;
    }
    const columns = reference.fields.map((field) => ({ name: field.name, type: field.dataTypeID }));
    const diff = compareResults(check.result, reference, { ordered: true, columns });
    if (!diff.passed) problems.push(`${check.label} changes when the statements run again: ${diff.message}`);
  });
  for (const test of actual.tests) if (!test.passed) problems.push(`Constraint "${test.name}" ${test.message}`);
  if (problems.length === 0) return { passed: true, message: 'Every check and constraint test matches the reference.', missing: [], extra: [] };
  return { passed: false, message: problems.join(' '), missing: firstRows?.missing ?? [], extra: firstRows?.extra ?? [] };
}

function sameChecks(a: StateResult['checks'], b: StateResult['checks']): boolean {
  if (a.length !== b.length) return false;
  return a.every((check, index) => {
    const other = b[index];
    if (!check.result || !other?.result) return check.error === other?.error;
    return sameRows(check.result, other.result, true);
  });
}

export function sameState(a: StateResult, b: StateResult): boolean {
  if (a.learnerError !== b.learnerError || a.tests.length !== b.tests.length) return false;
  const rerunMatch = a.rerunChecks === undefined || b.rerunChecks === undefined
    ? a.rerunChecks === b.rerunChecks
    : sameChecks(a.rerunChecks, b.rerunChecks);
  return sameChecks(a.checks, b.checks) && rerunMatch && a.tests.every((test, index) => test.passed === b.tests[index]?.passed);
}
