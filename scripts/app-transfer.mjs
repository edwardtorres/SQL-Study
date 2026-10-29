import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { preview } from 'vite';
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { chromium, webkit } = await import('playwright');
const kind = process.argv[2];
if (!['chromium', 'webkit'].includes(kind)) throw new Error('Choose chromium or webkit');
const options = { headless: true };
if (kind === 'chromium') {
  try { options.executablePath = process.env.CHROMIUM_EXECUTABLE ?? execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(); } catch { /* Use managed Chromium. */ }
}
const payload = (url, acceptEncoding) => new Promise((resolve, reject) => {
  get(url, { headers: { 'Accept-Encoding': acceptEncoding } }, (response) => {
    if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode}`)); return; }
    let bytes = 0;
    response.on('data', (chunk) => { bytes += chunk.length; });
    response.on('end', () => resolve({ bytes, encoding: response.headers['content-encoding'] ?? 'identity' }));
    response.on('error', reject);
  }).on('error', reject);
});
const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
let browser;
try {
  browser = await (kind === 'chromium' ? chromium : webkit).launch(options);
  // Playwright reports no Accept-Encoding for requests made by the engine worker or a service worker, so those would be replayed as
  // identity. The browser's own default is read once from a page fetch in a context with service workers blocked, where Playwright
  // reports the header. The unique query string keeps the probe from matching an earlier request for the same icon.
  const probeContext = await browser.newContext({ serviceWorkers: 'block' });
  const probePage = await probeContext.newPage();
  await probePage.goto('http://127.0.0.1:4173/');
  const probeUrl = `http://127.0.0.1:4173/icons/icon-192.png?probe=${Date.now()}`;
  const probed = probePage.waitForResponse(probeUrl);
  await probePage.evaluate((url) => fetch(url), probeUrl);
  const browserDefault = (await (await probed).request().allHeaders())['accept-encoding'];
  await probeContext.close();
  if (!browserDefault) throw new Error('The browser did not report its default Accept-Encoding');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  const responses = [];
  const errors = [];
  page.on('response', (response) => { if (['http:', 'https:'].includes(new URL(response.url()).protocol)) responses.push(response); });
  page.on('pageerror', (error) => { errors.push(error.message); });
  await page.goto('http://127.0.0.1:4173/');
  await page.evaluate(() => document.fonts.ready);
  const boardResponses = responses.length;
  if (responses.some((response) => /\.(wasm|data)$/.test(new URL(response.url()).pathname))) throw new Error('Engine loaded on the board');
  await page.getByRole('button', { name: /Open chapter 1$/ }).tap();
  await page.getByRole('button', { name: /The heavy-load shortlist/ }).first().tap();
  await page.waitForFunction(() => {
    const button = document.querySelector('.primary-button');
    return button && !button.disabled;
  }, undefined, { timeout: 40_000 });
  await page.getByRole('region', { name: 'shipments sample rows' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const observed = [...responses];
  const requests = [];
  for (const [index, response] of observed.entries()) {
    await response.finished();
    const url = new URL(response.url());
    if (url.hostname !== '127.0.0.1') throw new Error('Unexpected external runtime origin');
    const sent = await response.request().allHeaders();
    const reported = sent['accept-encoding'];
    const measured = await payload(response.url(), reported ?? browserDefault);
    if (/\.(wasm|data)$/.test(url.pathname) && measured.encoding === 'identity') throw new Error(`Engine asset was uncompressed: ${url.pathname}`);
    requests.push({
      asset: url.pathname.replace(/^\//, ''),
      screen: index < boardResponses ? 'board' : 'sql',
      acceptEncoding: reported ?? browserDefault,
      acceptEncodingSource: reported ? 'reported by Playwright' : 'browser default (probe without service workers)',
      ...measured,
    });
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  const report = {
    recordedAt: new Date().toISOString(), browser: kind, browserVersion: browser.version(),
    scope: 'Fresh browser context, 1280px touch viewport; actual observed requests replayed with the Accept-Encoding the browser sent (reported by Playwright, or the browser default for requests inside the engine worker), and encoded body bytes counted before decompression. Excludes headers/TLS; no mobile-network timing claim.',
    boardBytes: requests.filter((request) => request.screen === 'board').reduce((sum, request) => sum + request.bytes, 0),
    sqlAdditionalBytes: requests.filter((request) => request.screen === 'sql').reduce((sum, request) => sum + request.bytes, 0),
    totalBytes: requests.reduce((sum, request) => sum + request.bytes, 0), requests,
  };
  await writeFile(`docs/app-transfer-${kind}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
