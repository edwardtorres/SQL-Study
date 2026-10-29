import { interviewItems } from '../data/interview';
import type { ItemMeta } from '../data/itemIndex';
import { emptyProgress, type InterviewProblem, type InterviewResult, type InterviewSet, type SaveV5 } from '../save/format';
import { awardFor, isMastered, recordScored, recordStreakItem, REPEAT_XP } from './rules';

// Timed interview sets. Pure functions: the page reads the clock and the engine, and passes the results in.
// The numbers are documented in CLAUDE.md and pinned by tests/interview.test.ts.

export const INTERVIEW_PROBLEMS = 3;
// A problem with no estimate of its own (a chapter ticket other than chapter 13) is timed at the independent-ticket default.
export const DEFAULT_MINUTES = 6;
// The dev-only short set: one problem and two minutes.
export const SHORT_SET_PROBLEMS = 1;
export const SHORT_SET_MINUTES = 2;
export { interviewReady, READY_NEEDED, READY_WINDOW } from './interviewReady';
// An estimate is marked off when the learner's median time differs from it by more than this share of the estimate.
export const OFF_ESTIMATE_SHARE = 0.5;

export interface Candidate { id: string; chapterId: number; minutes: number }

const reserveOf = (id: string) => interviewItems.find((item) => item.id === id);

// A problem's estimate: a reserve problem declares its own, and so does a chapter 13 ticket. Anything else gets the default.
export function estimateOf(items: readonly ItemMeta[], id: string): number {
  return reserveOf(id)?.estimatedMinutes ?? items.find((item) => item.id === id)?.estimatedMinutes ?? DEFAULT_MINUTES;
}

// The competency a problem scores toward: its chapter. A reserve problem names its own; a chapter ticket is its chapter.
export function chapterOf(items: readonly ItemMeta[], id: string): number | undefined {
  return reserveOf(id)?.chapterId ?? items.find((item) => item.id === id)?.chapterId;
}

// A problem counts as seen once it has any attempt or sat in a finished set.
const seen = (save: Pick<SaveV5, 'tickets' | 'interviewHistory'>, id: string): boolean =>
  (save.tickets[id]?.attempts ?? 0) > 0 || save.interviewHistory.some((set) => set.problems.some((problem) => problem.id === id));

// Draw order: reserve problems first, then chapter 13 independent tickets, then independent tickets of mastered chapters
// from chapter 4 on (the multi-concept tickets). Within each group an unseen problem comes before a seen one, and the
// order inside each of those two parts is shuffled by random.
export function drawInterview(save: SaveV5, items: readonly ItemMeta[], count: number, random: () => number = Math.random): Candidate[] {
  const shuffle = <T,>(list: readonly T[]): T[] => {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
    }
    return copy;
  };
  const unseenFirst = (list: readonly { id: string }[]) => {
    const fresh = list.filter((entry) => !seen(save, entry.id));
    const used = list.filter((entry) => seen(save, entry.id));
    return [...shuffle(fresh), ...shuffle(used)];
  };
  const reserve = unseenFirst(interviewItems);
  const chapter13 = unseenFirst(items.filter((item) => item.role === 'independent' && item.chapterId === 13));
  const multi = unseenFirst(items.filter((item) => item.role === 'independent' && item.chapterId >= 4 && item.chapterId < 13 && isMastered(save, item.chapterId)));
  const ordered = [...reserve, ...chapter13, ...multi];
  const picked: Candidate[] = [];
  for (const entry of ordered) {
    if (picked.length >= count) break;
    if (picked.some((candidate) => candidate.id === entry.id)) continue;
    const chapterId = chapterOf(items, entry.id);
    if (chapterId === undefined) continue;
    picked.push({ id: entry.id, chapterId, minutes: estimateOf(items, entry.id) });
  }
  return picked;
}

// The limit is the sum of the problems' estimates, rounded up to a whole minute.
export const limitFor = (candidates: readonly Candidate[]): number =>
  Math.max(1, Math.ceil(candidates.reduce((sum, candidate) => sum + candidate.minutes, 0)));

// Each problem keeps the estimate it started with, so a later change to an estimate does not rewrite the set.
export function startInterview(candidates: readonly Candidate[], now: number, limitMinutes = limitFor(candidates)): InterviewSet {
  return {
    id: `set-${now}`, startedAt: now, limitMinutes,
    problems: candidates.map((candidate) => ({ id: candidate.id, passedAt: null, failures: 0, spentMs: 0, openedAt: null, estimateMinutes: candidate.minutes })),
  };
}

export const deadlineOf = (set: Pick<InterviewSet, 'startedAt' | 'limitMinutes'>): number => set.startedAt + set.limitMinutes * 60_000;
export const remainingMs = (set: InterviewSet, now: number): number => Math.max(0, deadlineOf(set) - now);
export const isExpired = (set: InterviewSet, now: number): boolean => now >= deadlineOf(set);

const withProblem = (set: InterviewSet, id: string, update: (problem: InterviewProblem) => InterviewProblem): InterviewSet =>
  ({ ...set, problems: set.problems.map((problem) => (problem.id === id ? update(problem) : problem)) });

// Counts the open time of one problem up to now, or to the deadline if that comes first. A checkpoint restarts the open
// interval at that moment; a close ends it.
function accrue(set: InterviewSet, id: string, now: number, keepOpen: boolean): InterviewSet {
  const deadline = deadlineOf(set);
  return withProblem(set, id, (problem) => {
    if (problem.openedAt === null) return problem;
    const end = Math.min(now, deadline);
    const spentMs = problem.spentMs + Math.max(0, end - problem.openedAt);
    return { ...problem, spentMs, openedAt: keepOpen && end < deadline ? end : null };
  });
}

// Opens a problem's workspace for timing. A problem that has passed is not timed again, and opening one closes any other.
export function openProblem(set: InterviewSet, id: string, now: number): InterviewSet {
  if (isExpired(set, now)) return set;
  let next = set;
  for (const problem of set.problems) if (problem.openedAt !== null && problem.id !== id) next = accrue(next, problem.id, now, false);
  return withProblem(next, id, (problem) => (problem.passedAt === null && problem.openedAt === null ? { ...problem, openedAt: now } : problem));
}

// Counts the time so far and keeps the workspace open. The page calls this every 30 seconds while a workspace is open.
export const checkpointProblem = (set: InterviewSet, id: string, now: number): InterviewSet => accrue(set, id, now, true);

// Counts the time so far and ends the open interval, when the workspace is left or the problem passes.
export const closeProblem = (set: InterviewSet, id: string, now: number): InterviewSet => accrue(set, id, now, false);

// A page that closed while a workspace was open leaves an open marker behind. Nothing is counted for it: time counts only at a
// checkpoint or a close, so a reload loses at most the time since the last checkpoint.
export const forgetOpen = (set: InterviewSet): InterviewSet =>
  ({ ...set, problems: set.problems.map((problem) => ({ ...problem, openedAt: null })) });

// A pass counts only before the deadline, and only the first pass inside the set is kept. Its time is counted up to the pass.
export function recordInterviewPass(set: InterviewSet, id: string, now: number): InterviewSet {
  if (isExpired(set, now)) return set;
  const closed = closeProblem(set, id, now);
  return withProblem(closed, id, (problem) => (problem.passedAt === null ? { ...problem, passedAt: now } : problem));
}

// After the deadline, a draft that passes when the timer ends counts as passed at the deadline itself.
export function settleExpiredPass(set: InterviewSet, id: string): InterviewSet {
  return withProblem(set, id, (problem) => (problem.passedAt === null ? { ...problem, passedAt: deadlineOf(set), openedAt: null } : problem));
}

export function recordInterviewFailure(set: InterviewSet, id: string, now: number): InterviewSet {
  if (isExpired(set, now)) return set;
  return withProblem(set, id, (problem) => ({ ...problem, failures: problem.failures + 1 }));
}

// Credit per problem: a first-time pass 1, a pass after failures 0.5, anything else 0. The expired and unpassed problems score 0.
export const interviewCredit = (problem: InterviewProblem): number => (problem.passedAt === null ? 0 : problem.failures === 0 ? 1 : 0.5);

// Settles a finished set. Readiness takes one attempt per problem, and passes earn XP and streak like any ticket.
// Mastery, the mistake log and the review schedules are never changed by an interview.
export function finishInterview(save: SaveV5, items: readonly ItemMeta[], set: InterviewSet, endedAt: number, day: string): { save: SaveV5; result: InterviewResult } {
  const expired = endedAt >= deadlineOf(set);
  let next: SaveV5 = { ...save, interview: null };
  for (const problem of set.problems) {
    const chapterId = chapterOf(items, problem.id) ?? 1;
    next = recordScored(next, chapterId, endedAt, interviewCredit(problem));
    const previous = next.tickets[problem.id] ?? emptyProgress();
    const passed = problem.passedAt !== null;
    const ticket = { ...previous, attempts: previous.attempts + Math.max(1, problem.failures + (passed ? 1 : 0)), failures: previous.failures + problem.failures };
    if (!passed) {
      next = { ...next, tickets: { ...next.tickets, [problem.id]: ticket } };
      continue;
    }
    const first = !previous.passed;
    const outcome = problem.failures === 0 ? 'first-try' : 'hinted';
    const xp = first ? awardFor('independent', outcome, 0) : previous.repeatDay !== day ? REPEAT_XP : 0;
    const updated = {
      ...ticket, passed: true, xp: previous.xp + xp, passedAt: problem.passedAt,
      firstOutcome: first ? outcome : previous.firstOutcome, firstPassAt: first ? problem.passedAt : previous.firstPassAt,
      repeatDay: !first && xp > 0 ? day : previous.repeatDay,
    };
    next = { ...next, tickets: { ...next.tickets, [problem.id]: updated }, streak: recordStreakItem(next.streak, day, problem.id) };
  }
  const problems = set.problems.map((problem) => ({ ...problem, openedAt: null }));
  const result: InterviewResult = { id: set.id, startedAt: set.startedAt, endedAt, limitMinutes: set.limitMinutes, problems, expired };
  return { save: { ...next, interview: null, interviewHistory: [...save.interviewHistory, result].slice(-20) }, result };
}

// One problem's learner times against its estimate. The median is over the finished sets that recorded a time.
export interface EstimateRow { id: string; estimate: number; medianMinutes: number; sets: number }

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

// Each problem that has a recorded time in a finished set. A result with no recorded time (a version 4 save) is left out, as
// is a problem never timed.
export function estimateComparison(history: readonly InterviewResult[]): EstimateRow[] {
  const timed = new Map<string, { minutes: number[]; estimate: number }>();
  for (const result of history) {
    for (const problem of result.problems) {
      if (problem.estimateMinutes === null || problem.spentMs <= 0) continue;
      const entry = timed.get(problem.id) ?? { minutes: [], estimate: problem.estimateMinutes };
      entry.minutes.push(problem.spentMs / 60_000);
      entry.estimate = problem.estimateMinutes;
      timed.set(problem.id, entry);
    }
  }
  return [...timed]
    .map(([id, { minutes, estimate }]) => ({ id, estimate, medianMinutes: median(minutes), sets: minutes.length }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// True when the median time is far enough from the estimate to be worth a look.
export const isOffEstimate = (row: EstimateRow): boolean => Math.abs(row.medianMinutes - row.estimate) / row.estimate > OFF_ESTIMATE_SHARE;
