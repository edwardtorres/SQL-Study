// Measures the cold path to a runnable editor on the production build, and the size of the main entry chunk.
// Usage: node scripts/measure-startup.mjs <output.json> [runs]
// Each run is a new browser context (nothing cached). The clock starts at the ticket click and stops when Run sample is enabled.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { preview } from 'vite';

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { chromium } = await import('playwright');

const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/measure-startup.mjs <output.json> [runs]');
const runs = Number(process.argv[3] ?? 5);
const base = 'http://127.0.0.1:4173';
const WIDTHS = [390, 1280];
const TICKET = /Newsletter names B to D/;

let executablePath = process.env.CHROMIUM_EXECUTABLE;
if (!executablePath) {
  try { executablePath = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(); } catch { /* Use the managed browser. */ }
}

// The main entry is the module script in index.html. Its sizes are what a phone downloads before the board appears.
async function mainChunk() {
  const html = await readFile('dist/index.html', 'utf8');
  const src = html.match(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"/)?.[1];
  if (!src) throw new Error('No main module script in dist/index.html');
  const bytes = await readFile(resolve('dist', src));
  return {
    file: src,
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
let browser;
const timings = {};
try {
  browser = await chromium.launch({ headless: true, executablePath: executablePath || undefined });
  for (const width of WIDTHS) {
    timings[width] = [];
    for (let run = 0; run < runs; run += 1) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
      const page = await context.newPage();
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.getByRole('button', { name: /Open chapter 1$/ }).click();
      const ticket = page.getByRole('button', { name: TICKET }).first();
      await ticket.waitFor({ state: 'visible' });
      const started = Date.now();
      await ticket.click();
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'Run sample');
        return button !== undefined && !button.disabled;
      }, null, { timeout: 60_000 });
      timings[width].push(Date.now() - started);
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}

const result = {
  measuredAt: new Date().toISOString(),
  runs,
  clickToRunEnabledMs: Object.fromEntries(WIDTHS.map((width) => [width, {
    median: Math.round(median(timings[width])),
    min: Math.min(...timings[width]),
    max: Math.max(...timings[width]),
    samples: timings[width],
  }])),
  mainChunk: await mainChunk(),
};
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
