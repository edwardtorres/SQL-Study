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

export const emptySave = (): SaveV3 => ({
  version: 3, activeTicket: null, tickets: {}, lessons: {}, chapters: {}, streak: emptyStreak(), independentRun: 0, longestRun: 0, badges: {},
});

export const emptyProgress = (draft = ''): TicketProgress => ({
  draft, attempts: 0, failures: 0, passed: false, hintTier: 0, solutionRevealed: false, xp: 0,
  firstOutcome: null, firstPassAt: null, passedAt: null, revealedAt: null, repeatDay: null,
});

export const emptyLesson = (): LessonProgress => ({ read: false, answer: null, correct: false });

export const emptyStreak = (): Streak => ({ current: 0, longest: 0, countedDay: null, itemsDay: null, items: [] });
