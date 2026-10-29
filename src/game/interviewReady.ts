import type { InterviewResult } from '../save/format';

// Interview-ready: at least READY_NEEDED of the last READY_WINDOW sets were submitted by the learner in time, with every problem passed.
// This module has no reserve data, so the office map can read the signal without loading the interview's problems.
export const READY_WINDOW = 3;
export const READY_NEEDED = 2;

// Interview-ready: at least READY_NEEDED of the last READY_WINDOW finished sets, each submitted in time, had every problem passed.
export function interviewReady(history: readonly InterviewResult[]): boolean {
  const last = history.slice(-READY_WINDOW);
  return last.filter((set) => !set.expired && set.problems.every((problem) => problem.passedAt !== null)).length >= READY_NEEDED;
}
