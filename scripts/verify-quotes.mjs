#!/usr/bin/env node
// Verifies that every citation quote appears verbatim on its live page, and maps each failure to the lessons and chapter items
// that cite it. Tags are stripped and HTML entities decoded; words are compared exactly, after whitespace collapse.
// A page is tried four times, waiting 2, 4 and 8 seconds between tries. A page that stays unreachable is a warning: it is listed,
// and it fails nothing. A quote that is not on its page, or a page that answers 404 or 410, fails the run.
// Writes docs/reviews/quotes.json. When QUOTE_ISSUE_BODY is set and something failed, the issue text goes to that file.
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
export const RETRY_WAITS_MS = [2_000, 4_000, 8_000];
const TIMEOUT_MS = 15_000;
const PAGES_AT_ONCE = 6;
const GONE = new Set([404, 410]);
export const FAILING = new Set(['missing', 'not-found']);
const REPORT_PATH = 'docs/reviews/quotes.json';

export function pageText(html) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const stripped = withoutScripts.replace(/<[^>]+>/g, ' ');
  const decoded = stripped.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return ENTITIES[name.toLowerCase()] ?? match;
  });
  return decoded.replace(/\s+/g, ' ');
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One page, fetched with retries. The status is 'fetched', 'not-found' (404 or 410, which is not retried) or 'unreachable'
// (every attempt failed, or a non-OK answer other than 404 or 410 came back every time).
export async function fetchPage(url, { fetchImpl = fetch, sleep = pause, waits = RETRY_WAITS_MS } = {}) {
  let last = { status: 'unreachable', httpStatus: 0, text: '', error: 'not tried' };
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    if (attempt > 0) await sleep(waits[attempt - 1]);
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
      if (response.ok) return { status: 'fetched', httpStatus: response.status, text: pageText(await response.text()), error: '' };
      if (GONE.has(response.status)) return { status: 'not-found', httpStatus: response.status, text: '', error: `HTTP ${response.status}` };
      last = { status: 'unreachable', httpStatus: response.status, text: '', error: `HTTP ${response.status}` };
    } catch (error) {
      last = { status: 'unreachable', httpStatus: 0, text: '', error: String(error) };
    }
  }
  return last;
}

// The verdict for one citation. An unreachable page says nothing about its quote, so it is not a verdict.
export function classify(citation, page) {
  if (page.status === 'unreachable') return 'unreachable';
  if (page.status === 'not-found') return 'not-found';
  return page.text.includes(citation.quote.replace(/\s+/g, ' ').trim()) ? 'verified' : 'missing';
}

// The sections of one lesson file, with the citations each section lists. Lesson files are TypeScript; their layout is fixed:
// a section opens with `id: 'cN-sM'` and its title on the next line, and its citations array follows before the next section.
export function parseLessonFile(text) {
  const chapterId = Number(text.match(/chapterId: (\d+)/)?.[1]);
  const starts = [...text.matchAll(/^ {6}id: '(c\d+-s\d+)',\n {6}title: '((?:[^'\\]|\\.)*)'/gm)];
  return starts.map((start, index) => {
    const end = starts[index + 1]?.index ?? text.length;
    const cited = text.slice(start.index, end).match(/citations: \[([^\]]*)\]/);
    return {
      chapterId,
      sectionId: start[1],
      title: start[2].replace(/\\(.)/g, '$1'),
      citations: cited ? [...cited[1].matchAll(/'([^']+)'/g)].map((match) => match[1]) : [],
    };
  });
}

// The items of the generated index, one per line. Fields are read one at a time, because their order and optional fields
// (bossGroup, estimatedMinutes) vary by item. Only the fields the issue text shows are kept.
export function parseItemIndex(text) {
  return text.split('\n').filter((line) => /^ {2}\{ id: /.test(line)).map((line) => ({
    id: line.match(/\{ id: '([^']+)'/)?.[1] ?? '',
    chapterId: Number(line.match(/chapterId: (\d+)/)?.[1]),
    role: line.match(/role: '([^']+)'/)?.[1] ?? '',
    title: (line.match(/, title: '((?:[^'\\]|\\.)*)'/)?.[1] ?? '').replace(/\\(.)/g, '$1'),
  }));
}

export function buildReport({ citations, pages, sections, items, checkedAt }) {
  const results = citations.map((citation) => {
    const page = pages.get(citation.url) ?? { status: 'unreachable', httpStatus: 0, text: '', error: 'not fetched' };
    const status = classify(citation, page);
    const result = { id: citation.id, url: citation.url, status, httpStatus: page.httpStatus };
    if (status === 'unreachable') result.error = page.error;
    if (FAILING.has(status)) {
      result.quote = citation.quote;
      result.lessons = sections
        .filter((section) => section.citations.includes(citation.id))
        .map(({ chapterId, sectionId, title }) => ({ chapterId, sectionId, title }));
      const chapters = new Set(result.lessons.map((lesson) => lesson.chapterId));
      result.items = items
        .filter((item) => chapters.has(item.chapterId))
        .map(({ id, chapterId, role, title }) => ({ id, chapterId, role, title }));
    }
    return result;
  });
  const count = (status) => results.filter((result) => result.status === status).length;
  return {
    checkedAt,
    total: results.length,
    verified: count('verified'),
    missing: count('missing'),
    notFound: count('not-found'),
    unreachable: count('unreachable'),
    results,
  };
}

// The issue text: one section per failing citation, with its page, its quote, the lessons that cite it, and the chapter's items.
export function issueBody(report) {
  const failing = report.results.filter((result) => FAILING.has(result.status));
  const lines = [
    `The weekly quote check found ${failing.length} citation${failing.length === 1 ? '' : 's'} that need review (checked ${report.checkedAt}).`,
    '',
    `Verified ${report.verified} of ${report.total}. Quote not on its page: ${report.missing}. Page answered 404 or 410: ${report.notFound}. `
      + 'Pages that could not be reached after retries are warnings in the job summary and do not appear here.',
  ];
  for (const result of failing) {
    lines.push('', `## \`${result.id}\`: ${result.status === 'missing' ? 'quote not on the page' : 'page not found'}`, '');
    lines.push(`- Page: ${result.url}`, '- Quote in `src/data/citations.json`:', '', `  > ${result.quote}`, '');
    lines.push('- Lessons that cite it:');
    if (result.lessons.length === 0) lines.push('  - none: no lesson section lists this citation');
    for (const lesson of result.lessons) lines.push(`  - Chapter ${lesson.chapterId}, ${lesson.sectionId}: ${lesson.title}`);
    for (const chapterId of new Set(result.lessons.map((lesson) => lesson.chapterId))) {
      const chapterItems = result.items.filter((item) => item.chapterId === chapterId);
      lines.push(`- Chapter ${chapterId} items: ${chapterItems.map((item) => `${item.id} (${item.role})`).join(', ')}`);
    }
  }
  lines.push(
    '',
    'To resolve: open each page and compare the quote. If the wording changed, correct the quote in `src/data/citations.json` and any lesson text that relies on it. If the page moved, correct its URL. '
      + 'Then run `npm run check:quotes`. The next weekly run checks again, and it closes this issue once every quote is verified.',
  );
  return `${lines.join('\n')}\n`;
}

export function summary(report) {
  const notChecked = report.results.filter((result) => result.status === 'unreachable');
  const failing = report.results.filter((result) => FAILING.has(result.status));
  const lines = [
    '## Lesson quote check',
    '',
    `Verified ${report.verified} of ${report.total} quotes on their live pages.`,
    '',
    `Failing: ${failing.length} (missing ${report.missing}, page not found ${report.notFound}). Not checked, unreachable after retries: ${notChecked.length}.`,
  ];
  if (failing.length > 0 || notChecked.length > 0) {
    lines.push('', '| Citation | Status | Page |', '| --- | --- | --- |');
    for (const result of [...failing, ...notChecked]) lines.push(`| \`${result.id}\` | ${result.status} | ${result.url} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function main() {
  const citations = JSON.parse(await readFile('src/data/citations.json', 'utf8'));
  const lessonFiles = (await readdir('src/data/lessons')).filter((name) => /^ch\d+\.ts$/.test(name));
  const sections = (await Promise.all(lessonFiles.map(async (name) => parseLessonFile(await readFile(join('src/data/lessons', name), 'utf8'))))).flat();
  const items = parseItemIndex(await readFile('src/data/itemIndex.ts', 'utf8'));

  const pages = new Map();
  const urls = [...new Set(citations.map((citation) => citation.url))];
  for (let start = 0; start < urls.length; start += PAGES_AT_ONCE) {
    await Promise.all(urls.slice(start, start + PAGES_AT_ONCE).map(async (url) => pages.set(url, await fetchPage(url))));
  }

  const report = buildReport({ citations, pages, sections, items, checkedAt: new Date().toISOString() });
  const reportPath = process.env.QUOTE_REPORT ?? REPORT_PATH;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const failing = report.results.filter((result) => FAILING.has(result.status));
  console.log(`quotes: ${report.verified} of ${report.total} verbatim on their live pages`);
  for (const result of report.results.filter((item) => item.status === 'unreachable')) {
    console.log(`::warning title=Quote not checked::${result.id} (${result.url}) could not be reached after retries: ${result.error}`);
  }
  for (const result of failing) console.log(`NOT VERIFIED ${result.id} (${result.status}) ${result.url}`);
  if (failing.length > 0 && process.env.QUOTE_ISSUE_BODY) await writeFile(process.env.QUOTE_ISSUE_BODY, issueBody(report));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary(report));
  process.exitCode = failing.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
