export const SAVE_KEY = 'larkspur-sql-desk.progress';

// How a ticket's first pass was earned. It sets the XP award, the readiness credit and the badges.
export type Outcome = 'first-try' | 'hinted' | 'revealed';

// Version 3 keeps the version 2 fields and adds the timestamps and outcome the game rules read.
// Times are epoch milliseconds. A migrated save has no times, so its times are 0.
export interface TicketProgress {
  draft: string;
  attempts: number;
  failures: number;
  passed: boolean;
  hintTier: number;
  solutionRevealed: boolean;
  xp: number;
  firstOutcome: Outcome | null;
  firstPassAt: number | null;
  // The latest pass that counts toward mastery. A boss part's pass is void when it is older than the reveal.
  passedAt: number | null;
  revealedAt: number | null;
  // The local day that last earned a repeat award, so a repeat pass earns once per day.
  repeatDay: string | null;
}

export interface LessonProgress { read: boolean; answer: string | null; correct: boolean }

// Only mastered chapters are stored. Mastery is kept once earned.
export interface ChapterProgress { method: 'boss' | 'test-out'; masteredAt: number }

// countedDay is the last local day with three distinct passed items. items are the distinct items passed on itemsDay.
export interface Streak { current: number; longest: number; countedDay: string | null; itemsDay: string | null; items: string[] }

// Version 3 shape. Kept for the migration; the current shape is SaveV5.
export interface SaveV3 {
  version: 3;
  activeTicket: string | null;
  tickets: Record<string, TicketProgress>;
  lessons: Record<string, LessonProgress>;
  chapters: Record<string, ChapterProgress>;
  streak: Streak;
  independentRun: number;
  longestRun: number;
  // Badge id to the time it was earned. Earned badges are never removed.
  badges: Record<string, number>;
}

// One scored attempt in a competency's readiness window: when it happened and the credit it earned.
export interface ScoredAttempt { at: number; credit: number }

// A failed or revealed attempt, with the mistake tag its wrong variant matched (null when none did).
export type MistakeKind = 'failed' | 'revealed';
export interface MistakeEntry { at: number; day: string; itemId: string; competency: number; tag: string | null; kind: MistakeKind }

// One problem in a timed set. passedAt is when it passed inside the set; failures counts its failed submissions in the set.
// spentMs is the time its workspace was open before it passed. It is counted on close and at each 30-second checkpoint.
// openedAt is set only while the workspace is open. A reload clears it without counting, so a reload loses at most 30 seconds.
// estimateMinutes is the estimate the set started with; null when a version 4 save did not record one.
export interface InterviewProblem {
  id: string; passedAt: number | null; failures: number; spentMs: number; openedAt: number | null; estimateMinutes: number | null;
}
// A running set. startedAt and limitMinutes give the deadline.
export interface InterviewSet { id: string; startedAt: number; limitMinutes: number; problems: InterviewProblem[] }
// A finished set. expired is set when the timer ended the set rather than the learner.
export interface InterviewResult { id: string; startedAt: number; endedAt: number; limitMinutes: number; problems: InterviewProblem[]; expired: boolean }

// Version 4 shapes, kept for the migration to version 5. Version 4 recorded no time per problem.
export interface InterviewProblemV4 { id: string; passedAt: number | null; failures: number }
export interface InterviewSetV4 { id: string; startedAt: number; limitMinutes: number; problems: InterviewProblemV4[] }
export interface InterviewResultV4 { id: string; startedAt: number; endedAt: number; limitMinutes: number; problems: InterviewProblemV4[]; expired: boolean }

// Review schedule for a ticket or a mistake tag. step indexes REVIEW_INTERVALS; dueDay is the next day it is due.
export interface Schedule { step: number; dueDay: string; lastDay: string | null; lastOutcome: 'pass' | 'miss' | null }

// Version 5 adds the solve time, the open-workspace marker and the estimate to each interview problem.
export interface SaveV5 {
  version: 5;
  activeTicket: string | null;
  tickets: Record<string, TicketProgress>;
  lessons: Record<string, LessonProgress>;
  chapters: Record<string, ChapterProgress>;
  streak: Streak;
  independentRun: number;
  longestRun: number;
  badges: Record<string, number>;
  // Per chapter (competency), the most recent scored attempts. Readiness is computed from this window.
  readiness: Record<string, ScoredAttempt[]>;
  // The most recent failed and revealed attempts. Totals are kept separately so trimming the log loses no counts.
  mistakeLog: MistakeEntry[];
  mistakeTotals: { tags: Record<string, number>; competencies: Record<string, number> };
  reviews: { tags: Record<string, Schedule>; items: Record<string, Schedule> };
  // Per competency, the most recent review attempts: 'pass' means first try or hinted, 'miss' otherwise.
  reviewRecent: Record<string, ('pass' | 'miss')[]>;
  // The day's Daily Review tickets, saved when the page first opens that day.
  dailyReview: { day: string; itemIds: string[] } | null;
  // The running timed set, if any. Its start and limit give the deadline, so a reload keeps the time left.
  interview: InterviewSet | null;
  // The last finished sets, oldest first. Only the last few decide the interview-ready signal.
  interviewHistory: InterviewResult[];
}

// Version 4 is the shape before the interview timing fields. Only the migration reads it.
export type SaveV4 = Omit<SaveV5, 'version' | 'interview' | 'interviewHistory'> & {
  version: 4;
  interview: InterviewSetV4 | null;
  interviewHistory: InterviewResultV4[];
};

export const emptySave = (): SaveV5 => ({
  version: 5, activeTicket: null, tickets: {}, lessons: {}, chapters: {}, streak: emptyStreak(), independentRun: 0, longestRun: 0, badges: {},
  readiness: {}, mistakeLog: [], mistakeTotals: { tags: {}, competencies: {} }, reviews: { tags: {}, items: {} }, reviewRecent: {},
  dailyReview: null, interview: null, interviewHistory: [],
});

export const emptyProgress = (draft = ''): TicketProgress => ({
  draft, attempts: 0, failures: 0, passed: false, hintTier: 0, solutionRevealed: false, xp: 0,
  firstOutcome: null, firstPassAt: null, passedAt: null, revealedAt: null, repeatDay: null,
});

export const emptyLesson = (): LessonProgress => ({ read: false, answer: null, correct: false });

export const emptyStreak = (): Streak => ({ current: 0, longest: 0, countedDay: null, itemsDay: null, items: [] });
