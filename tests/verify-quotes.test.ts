import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { buildReport, classify, fetchPage, issueBody, main, parseItemIndex, parseLessonFile, pageText, summary } from '../scripts/verify-quotes.mjs';
import type { Citation, LessonSection, Page } from '../scripts/verify-quotes.mjs';

// The quote check runs weekly against public pages. These tests use a mocked fetch and a mocked sleep, so none of them reaches a page.
const ok = (body: string) => new Response(body, { status: 200 });
const code = (status: number) => new Response('', { status });
const url = 'https://www.postgresql.org/docs/18/example.html';
const page = (overrides: Partial<Page>): Page => ({ status: 'fetched', httpStatus: 200, text: '', error: '', ...overrides });

describe('reading the page', () => {
  test('tags are removed, entities decoded and whitespace collapsed', () => {
    expect(pageText('<p>Use&nbsp;<b>WHERE</b> &amp;\n  more</p>').trim()).toBe('Use WHERE & more');
  });
});

describe('fetching a page', () => {
  test('a server error is retried once, and the second answer is used', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchImpl = vi.fn().mockImplementationOnce(async () => code(503)).mockImplementationOnce(async () => ok('<p>quote</p>'));
    const fetched = await fetchPage(url, { fetchImpl, sleep });
    expect(fetched.status).toBe('fetched');
    expect(fetched.text.trim()).toBe('quote');
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([2_000]);
  });

  test('a page that keeps failing is tried four times, waiting 2, 4 and 8 seconds, and is unreachable rather than missing', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchImpl = vi.fn(async () => code(500));
    const fetched = await fetchPage(url, { fetchImpl, sleep });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([2_000, 4_000, 8_000]);
    expect(fetched.status).toBe('unreachable');
    expect(fetched.error).toBe('HTTP 500');
  });

  test('a network error is retried the same way and ends unreachable', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const fetched = await fetchPage(url, { fetchImpl, sleep });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetched.status).toBe('unreachable');
    expect(fetched.error).toContain('fetch failed');
  });

  test('a 404 or 410 is not retried, and it is a not-found page', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchImpl = vi.fn(async () => code(404));
    const fetched = await fetchPage(url, { fetchImpl, sleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(fetched.status).toBe('not-found');
    expect((await fetchPage(url, { fetchImpl: vi.fn(async () => code(410)), sleep })).status).toBe('not-found');
  });
});

describe('the verdict for one quote', () => {
  const citation: Citation = { id: 'pg-where', url, quote: 'The WHERE   clause filters rows.' };

  test('a quote on the page, after whitespace is collapsed, is verified', () => {
    expect(classify(citation, page({ text: ' The WHERE clause filters rows. ' }))).toBe('verified');
  });

  test('a quote that is not on the page is missing', () => {
    expect(classify(citation, page({ text: 'Something else entirely' }))).toBe('missing');
  });

  test('an unreachable page is not a verdict on the quote, and a 404 is a not-found', () => {
    expect(classify(citation, page({ status: 'unreachable', httpStatus: 0, text: '', error: 'x' }))).toBe('unreachable');
    expect(classify(citation, page({ status: 'not-found', httpStatus: 404, text: '', error: 'HTTP 404' }))).toBe('not-found');
  });
});

describe('the lesson and item indexes', () => {
  test('each section keeps its id, title and the citations listed under it', () => {
    const sample = [
      'export const lesson1: Lesson = {',
      '  chapterId: 1,',
      '  sections: [',
      '    {',
      "      id: 'c1-s1',",
      "      title: 'Read columns',",
      '      paragraphs: [],',
      "      citations: ['pg-a', 'pg-b'],",
      '    },',
      '    {',
      "      id: 'c1-s2',",
      "      title: 'Filter rows',",
      '      citations: [],',
      '    },',
      '  ],',
      '};',
    ].join('\n');
    expect(parseLessonFile(sample)).toEqual([
      { chapterId: 1, sectionId: 'c1-s1', title: 'Read columns', citations: ['pg-a', 'pg-b'] },
      { chapterId: 1, sectionId: 'c1-s2', title: 'Filter rows', citations: [] },
    ]);
  });

  test('every citations array in the real lessons belongs to a section', () => {
    const files = readdirSync('src/data/lessons').filter((name) => /^ch\d+\.ts$/.test(name));
    const sections = files.flatMap((name) => parseLessonFile(readFileSync(`src/data/lessons/${name}`, 'utf8')));
    const arrays = files.reduce((count, name) => count + (readFileSync(`src/data/lessons/${name}`, 'utf8').match(/citations: \[/g)?.length ?? 0), 0);
    expect(sections.length).toBe(arrays);
    expect(sections.length).toBeGreaterThan(0);
  });

  test('the item index is read one entry per line, boss parts included', () => {
    const text = readFileSync('src/data/itemIndex.ts', 'utf8');
    const items = parseItemIndex(text);
    expect(items.length).toBe(text.match(/^ {2}\{ id: /gm)?.length);
    expect(items.find((item) => item.id === 'c1-b1-p1')).toMatchObject({ chapterId: 1, role: 'boss' });
  });
});

describe('the report', () => {
  const sections: LessonSection[] = [
    { chapterId: 1, sectionId: 'c1-s2', title: 'Filter rows with WHERE', citations: ['pg-where'] },
    { chapterId: 2, sectionId: 'c2-s1', title: 'Joins', citations: ['pg-gone'] },
  ];
  const items = [
    { id: 'dispatch', chapterId: 1, role: 'sample', title: 'Heavy loads' },
    { id: 'c1-b1-p1', chapterId: 1, role: 'boss', title: 'Boss part' },
    { id: 'c2-i1', chapterId: 2, role: 'independent', title: 'Join ticket' },
  ];
  const citations: Citation[] = [
    { id: 'pg-where', url: 'https://www.postgresql.org/a', quote: 'The WHERE clause filters rows.' },
    { id: 'pg-gone', url: 'https://www.postgresql.org/b', quote: 'Joins combine tables.' },
    { id: 'pg-slow', url: 'https://www.postgresql.org/c', quote: 'Not checked this week.' },
    { id: 'pg-ok', url: 'https://www.postgresql.org/d', quote: 'Verified sentence.' },
  ];
  const pages = new Map<string, Page>([
    ['https://www.postgresql.org/a', page({ text: 'Only other words here.' })],
    ['https://www.postgresql.org/b', page({ status: 'not-found', httpStatus: 404, error: 'HTTP 404' })],
    ['https://www.postgresql.org/c', page({ status: 'unreachable', httpStatus: 0, error: 'timeout' })],
    ['https://www.postgresql.org/d', page({ text: 'A Verified sentence.' })],
  ]);
  const report = buildReport({ citations, pages, sections, items, checkedAt: '2026-11-02T06:17:00.000Z' });

  test('each quote gets one verdict and the counts add up', () => {
    expect(report.results.map((result) => result.status)).toEqual(['missing', 'not-found', 'unreachable', 'verified']);
    expect(report).toMatchObject({ total: 4, verified: 1, missing: 1, notFound: 1, unreachable: 1 });
  });

  test('a failing quote names the lessons that cite it and the items of their chapters', () => {
    const [missing] = report.results;
    expect(missing?.lessons).toEqual([{ chapterId: 1, sectionId: 'c1-s2', title: 'Filter rows with WHERE' }]);
    expect(missing?.items?.map((item) => item.id)).toEqual(['dispatch', 'c1-b1-p1']);
  });

  test('an unreachable quote carries its error and no lesson list, since it is not a failure', () => {
    const slow = report.results[2];
    expect(slow?.error).toBe('timeout');
    expect(slow?.lessons).toBeUndefined();
  });

  test('the issue text names each failing citation, its page, its quote, its lessons and its chapter items', () => {
    const body = issueBody(report);
    expect(body).toContain('2 citations that need review');
    expect(body).toContain('## `pg-where`: quote not on the page');
    expect(body).toContain('## `pg-gone`: page not found');
    expect(body).toContain('> The WHERE clause filters rows.');
    expect(body).toContain('Chapter 1, c1-s2: Filter rows with WHERE');
    expect(body).toContain('Chapter 1 items: dispatch (sample), c1-b1-p1 (boss)');
    expect(body).not.toContain('pg-slow');
  });

  test('the job summary lists the failures and the unchecked pages', () => {
    const text = summary(report);
    expect(text).toContain('Verified 1 of 4 quotes');
    expect(text).toContain('| `pg-slow` | unreachable | https://www.postgresql.org/c |');
    expect(text).toContain('| `pg-where` | missing | https://www.postgresql.org/a |');
  });
});

// The whole script on the real citation data, with fetch stubbed. Its outputs go to a temporary folder, never to the tracked report.
describe('the script end to end', () => {
  const citations = JSON.parse(readFileSync('src/data/citations.json', 'utf8')) as Citation[];

  async function runWith(text: string) {
    const dir = mkdtempSync(join(tmpdir(), 'quote-check-'));
    vi.stubEnv('QUOTE_REPORT', join(dir, 'quotes.json'));
    vi.stubEnv('QUOTE_ISSUE_BODY', join(dir, 'issue.md'));
    vi.stubEnv('GITHUB_STEP_SUMMARY', join(dir, 'summary.md'));
    vi.stubGlobal('fetch', vi.fn(async () => ok(`<html><body>${text}</body></html>`)));
    try {
      await main();
      return { exitCode: process.exitCode, dir };
    } finally {
      process.exitCode = undefined;
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  }

  test('every quote on its page: exit 0, the report and summary are written, and no issue text is made', async () => {
    const { exitCode, dir } = await runWith(citations.map((citation) => citation.quote).join(' '));
    expect(exitCode).toBe(0);
    const report = JSON.parse(readFileSync(join(dir, 'quotes.json'), 'utf8'));
    expect(report).toMatchObject({ total: citations.length, verified: citations.length, missing: 0 });
    expect(readFileSync(join(dir, 'summary.md'), 'utf8')).toContain('## Lesson quote check');
    expect(() => readFileSync(join(dir, 'issue.md'), 'utf8')).toThrow();
  });

  test('a quote that is not on its page: exit 1, and the issue text names the citation', async () => {
    const { exitCode, dir } = await runWith('Nothing the citations quote appears here.');
    expect(exitCode).toBe(1);
    const body = readFileSync(join(dir, 'issue.md'), 'utf8');
    expect(body).toContain('need review');
    expect(body).toContain('quote not on the page');
  });
});
