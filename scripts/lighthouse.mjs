// Runs Lighthouse on the production build at the default mobile settings, the number of times asked for, and writes a summary.
// Usage: node scripts/lighthouse.mjs <summary-dir> [runs] [report-dir]
// The full reports go to report-dir when given; only the summary is meant for the repository.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { preview } from 'vite';

// Async: the preview server runs in this process, so a blocking child process would stop it answering the browser.
const runProcess = promisify(execFile);

const summaryDir = process.argv[2];
if (!summaryDir) throw new Error('Usage: node scripts/lighthouse.mjs <summary-dir> [runs] [report-dir]');
const runs = Number(process.argv[3] ?? 3);
const reportDir = process.argv[4] ?? join(summaryDir, 'reports');
const url = 'http://127.0.0.1:4173/';
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

// The Chromium the end-to-end tests use, unless a path is given.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { chromium } = await import('playwright');
const chromePath = process.env.CHROME_PATH ?? process.env.CHROMIUM_EXECUTABLE ?? chromium.executablePath();

const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
const results = [];
try {
  await mkdir(reportDir, { recursive: true });
  for (let run = 1; run <= runs; run += 1) {
    const output = join(reportDir, `run-${run}.json`);
    await runProcess(process.execPath, [
      'node_modules/lighthouse/cli/index.js', url,
      `--only-categories=${CATEGORIES.join(',')}`,
      '--output=json', `--output-path=${output}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--quiet',
    ], { env: { ...process.env, CHROME_PATH: chromePath ?? '' }, maxBuffer: 64 * 1024 * 1024 });
    const report = JSON.parse(await readFile(output, 'utf8'));
    const scores = Object.fromEntries(CATEGORIES.map((category) => [category, Math.round((report.categories[category].score ?? 0) * 100)]));
    const audits = report.audits;
    results.push({
      run,
      lighthouseVersion: report.lighthouseVersion,
      scores,
      metrics: {
        firstContentfulPaintMs: Math.round(audits['first-contentful-paint'].numericValue),
        largestContentfulPaintMs: Math.round(audits['largest-contentful-paint'].numericValue),
        totalBlockingTimeMs: Math.round(audits['total-blocking-time'].numericValue),
        cumulativeLayoutShift: Number(audits['cumulative-layout-shift'].numericValue.toFixed(3)),
        speedIndexMs: Math.round(audits['speed-index'].numericValue),
      },
    });
  }
} finally {
  await server.close();
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summary = {
  url,
  form: 'mobile (Lighthouse default: simulated throttling, 412 x 823 viewport)',
  runs,
  medianScores: Object.fromEntries(CATEGORIES.map((category) => [category, median(results.map((result) => result.scores[category]))])),
  results,
};
await mkdir(summaryDir, { recursive: true });
await writeFile(join(summaryDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
