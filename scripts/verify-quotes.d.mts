// Declarations for verify-quotes.mjs, so the tests and the typechecker see its shapes. Keep this file in step with that module.
export interface Citation {
  id: string;
  url: string;
  quote: string;
}

export interface Page {
  status: 'fetched' | 'not-found' | 'unreachable';
  httpStatus: number;
  text: string;
  error: string;
}

export interface LessonSection {
  chapterId: number;
  sectionId: string;
  title: string;
  citations: string[];
}

export interface ItemRef {
  id: string;
  chapterId: number;
  role: string;
  title: string;
}

export type Verdict = 'verified' | 'missing' | 'not-found' | 'unreachable';

export interface Result {
  id: string;
  url: string;
  status: Verdict;
  httpStatus: number;
  error?: string;
  quote?: string;
  lessons?: Array<Pick<LessonSection, 'chapterId' | 'sectionId' | 'title'>>;
  items?: ItemRef[];
}

export interface Report {
  checkedAt: string;
  total: number;
  verified: number;
  missing: number;
  notFound: number;
  unreachable: number;
  results: Result[];
}

export const RETRY_WAITS_MS: number[];
export const FAILING: Set<string>;
export function pageText(html: string): string;
export function fetchPage(
  url: string,
  options?: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; waits?: number[] },
): Promise<Page>;
export function classify(citation: Citation, page: Page): Verdict;
export function parseLessonFile(text: string): LessonSection[];
export function parseItemIndex(text: string): ItemRef[];
export function buildReport(input: {
  citations: Citation[];
  pages: Map<string, Page>;
  sections: LessonSection[];
  items: ItemRef[];
  checkedAt: string;
}): Report;
export function issueBody(report: Report): string;
export function summary(report: Report): string;
export function main(): Promise<void>;
