import { interviewItems } from '../data/interview';
import type { ItemMeta } from '../data/itemIndex';
import { emptyProgress, type InterviewProblem, type InterviewResult, type InterviewSet, type SaveV4 } from '../save/format';
import { awardFor, isMastered, recordScored, recordStreakItem, REPEAT_XP } from './rules';

// Timed interview sets. Pure functions: the page reads the clock and the engine, and passes the results in.
// The numbers are documented in CLAUDE.md and pinned by tests/interview.test.ts.

export const INTERVIEW_PROBLEMS = 3;
// A problem with no estimate of its own (a chapter ticket) is timed at the independent-ticket default.
export const DEFAULT_MINUTES = 6;
// The dev-only short set: one problem and two minutes.
export const SHORT_SET_PROBLEMS = 1;
export const SHORT_SET_MINUTES = 2;
// Interview-ready: at least READY_NEEDED of the last READY_WINDOW sets were submitted by the learner in time, with every problem passed.
export const READY_WINDOW = 3;
export const READY_NEEDED = 2;

export interface Candidate { id: string; chapterId: number; minutes: number }

const reserveOf = (id: string) => interviewItems.find((item) => item.id === id);
// Only a set's problems are timed, so this is the one place a problem’s estimate is read.
const minutesOf = (id: string): number => reserveOf(id)?.estimatedMinutes ?? DEFAULT_MINUTES;

// The competency a problem scores toward: its chapter. A reserve problem names its own; a chapter ticket is its chapter.
export function chapterOf(items: readonly ItemMeta[], id: string): number | undefined {
  return reserveOf(id)?.chapterId ?? items.find((item) => item.id === id)?.chapterId;
}

// A problem counts as seen once it has any attempt or sat in a finished set.
const seen = (save: Pick<SaveV4, 'tickets' | 'interviewHistory'>, id: string): boolean =>
  (save.tickets[id]?.attempts ?? 0) > 0 || save.interviewHistory.some((set) => set.problems.some((problem) => problem.id === id));

// Draw order: reserve problems first, then chapter 13 independent tickets, then independent tickets of mastered chapters
// from chapter 4 on (the multi-concept tickets). Within each group an unseen problem comes before a seen one, and the
// order inside each of those two parts is shuffled by random.
export function drawInterview(save: SaveV4, items: readonly ItemMeta[], count: number, random: () => number = Math.random): Candidate[] {
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
    picked.push({ id: entry.id, chapterId, minutes: minutesOf(entry.id) });
  }
  return picked;
}

// The limit is the sum of the problems' estimates, rounded up to a whole minute.
export const limitFor = (candidates: readonly Candidate[]): number =>
  Math.max(1, Math.ceil(candidates.reduce((sum, candidate) => sum + candidate.minutes, 0)));

export function startInterview(candidates: readonly Candidate[], now: number, limitMinutes = limitFor(candidates)): InterviewSet {
  return {
    id: `set-${now}`, startedAt: now, limitMinutes,
    problems: candidates.map((candidate) => ({ id: candidate.id, passedAt: null, failures: 0 })),
  };
}

export const deadlineOf = (set: Pick<InterviewSet, 'startedAt' | 'limitMinutes'>): number => set.startedAt + set.limitMinutes * 60_000;
export const remainingMs = (set: InterviewSet, now: number): number => Math.max(0, deadlineOf(set) - now);
export const isExpired = (set: InterviewSet, now: number): boolean => now >= deadlineOf(set);

const withProblem = (set: InterviewSet, id: string, update: (problem: InterviewProblem) => InterviewProblem): InterviewSet =>
  ({ ...set, problems: set.problems.map((problem) => (problem.id === id ? update(problem) : problem)) });

// A pass counts only before the deadline, and only the first pass inside the set is kept.
export function recordInterviewPass(set: InterviewSet, id: string, now: number): InterviewSet {
  if (isExpired(set, now)) return set;
  return withProblem(set, id, (problem) => (problem.passedAt === null ? { ...problem, passedAt: now } : problem));
}

// After the deadline, a draft that passes when the timer ends counts as passed at the deadline itself.
export function settleExpiredPass(set: InterviewSet, id: string): InterviewSet {
  return withProblem(set, id, (problem) => (problem.passedAt === null ? { ...problem, passedAt: deadlineOf(set) } : problem));
}

export function recordInterviewFailure(set: InterviewSet, id: string, now: number): InterviewSet {
  if (isExpired(set, now)) return set;
  return withProblem(set, id, (problem) => ({ ...problem, failures: problem.failures + 1 }));
}

// Credit per problem: a first-time pass 1, a pass after failures 0.5, anything else 0. The expired and unpassed problems score 0.
export const interviewCredit = (problem: InterviewProblem): number => (problem.passedAt === null ? 0 : problem.failures === 0 ? 1 : 0.5);

// Settles a finished set. Readiness takes one attempt per problem, and passes earn XP and streak like any ticket.
// Mastery, the mistake log and the review schedules are never changed by an interview.
export function finishInterview(save: SaveV4, items: readonly ItemMeta[], set: InterviewSet, endedAt: number, day: string): { save: SaveV4; result: InterviewResult } {
  const expired = endedAt >= deadlineOf(set);
  let next: SaveV4 = { ...save, interview: null };
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
  const result: InterviewResult = { id: set.id, startedAt: set.startedAt, endedAt, limitMinutes: set.limitMinutes, problems: set.problems, expired };
  return { save: { ...next, interview: null, interviewHistory: [...save.interviewHistory, result].slice(-20) }, result };
}

// Interview-ready: at least READY_NEEDED of the last READY_WINDOW finished sets, each submitted in time, had every problem passed.
export function interviewReady(history: readonly InterviewResult[]): boolean {
  const last = history.slice(-READY_WINDOW);
  return last.filter((set) => !set.expired && set.problems.every((problem) => problem.passedAt !== null)).length >= READY_NEEDED;
}
