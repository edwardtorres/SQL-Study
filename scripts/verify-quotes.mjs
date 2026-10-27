#!/usr/bin/env node
// Verifies that every citation quote appears verbatim on its live page.
// Tags are stripped and HTML entities decoded; words are compared exactly, after whitespace collapse.
// Writes docs/reviews/quotes.json. Exits non-zero when any quote is missing or a page cannot be fetched.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const citations = JSON.parse(await readFile('src/data/citations.json', 'utf8'));
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

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

const pages = new Map();
for (const url of new Set(citations.map((citation) => citation.url))) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
    if (!response.ok) {
      pages.set(url, { status: 'fetch-failed', httpStatus: response.status, text: '' });
      continue;
    }
    pages.set(url, { status: 'fetched', httpStatus: response.status, text: pageText(await response.text()) });
  } catch (error) {
    pages.set(url, { status: 'fetch-failed', httpStatus: 0, text: '', error: String(error) });
  }
}

const results = citations.map((citation) => {
  const page = pages.get(citation.url);
  if (page.status !== 'fetched') return { id: citation.id, url: citation.url, status: page.status, httpStatus: page.httpStatus };
  const verified = page.text.includes(citation.quote.replace(/\s+/g, ' ').trim());
  return { id: citation.id, url: citation.url, status: verified ? 'verified' : 'missing', httpStatus: page.httpStatus };
});

const report = { checkedAt: new Date().toISOString(), total: results.length, verified: results.filter((r) => r.status === 'verified').length, results };
await mkdir(dirname('docs/reviews/quotes.json'), { recursive: true });
await writeFile('docs/reviews/quotes.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`quotes: ${report.verified} of ${report.total} verbatim on their live pages`);
for (const result of results.filter((r) => r.status !== 'verified')) console.log(`NOT VERIFIED ${result.id} (${result.status}) ${result.url}`);
process.exitCode = report.verified === report.total ? 0 : 1;
