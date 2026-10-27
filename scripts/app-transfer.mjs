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
  await page.locator('.ticket-card').first().getByRole('button', { name: 'Open ticket' }).tap();
  await page.waitForFunction(() => {
    const button = document.querySelector('.primary-button');
    return button && !button.disabled;
  }, undefined, { timeout: 40_000 });
  await page.getByRole('region', { name: 'shipments sample rows' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const requests = [];
  for (const [index, response] of responses.entries()) {
    await response.finished();
    const url = new URL(response.url());
    if (url.hostname !== '127.0.0.1') throw new Error('Unexpected external runtime origin');
    const sent = await response.request().allHeaders();
    const measured = await payload(response.url(), sent['accept-encoding'] ?? 'identity');
    if (/\.(wasm|data)$/.test(url.pathname) && measured.encoding === 'identity') throw new Error(`Engine asset was uncompressed: ${url.pathname}`);
    requests.push({ asset: url.pathname.replace(/^\//, ''), screen: index < boardResponses ? 'board' : 'sql', ...measured });
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  const report = {
    recordedAt: new Date().toISOString(), browser: kind, browserVersion: browser.version(),
    scope: 'Fresh browser context, 1280px touch viewport; actual observed requests replayed with browser Accept-Encoding and encoded body bytes counted before decompression. Excludes headers/TLS; no mobile-network timing claim.',
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
