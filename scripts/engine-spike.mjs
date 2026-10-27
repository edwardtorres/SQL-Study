import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { gzipSync } from 'node:zlib';
import { preview } from 'vite';

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { chromium, webkit } = await import('playwright');
const engine = process.argv[2];
if (engine !== 'chromium' && engine !== 'webkit') {
  throw new Error('Choose chromium or webkit.');
}

const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
// Measure raw HTTP payload bytes without Node fetch's automatic decompression.
// Replay observed requests rather than relying on incomplete worker timing data.
const measurePayload = (url, acceptEncoding) => new Promise((resolve, reject) => {
  get(url, { headers: { 'Accept-Encoding': acceptEncoding } }, (response) => {
    if (response.statusCode !== 200) {
      response.resume();
      reject(new Error(`Payload replay returned HTTP ${response.statusCode}`));
      return;
    }
    let bytes = 0;
    response.on('data', (chunk) => { bytes += chunk.length; });
    response.on('end', () => resolve({ bytes, encoding: response.headers['content-encoding'] ?? 'identity' }));
    response.on('error', reject);
  }).on('error', reject);
});
let browser;
try {
  const options = { headless: true };
  if (engine === 'chromium') {
    // Prefer the supplied system browser; do not persist machine-specific paths.
    try {
      options.executablePath = process.env.CHROMIUM_EXECUTABLE ?? execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
    } catch {
      // Fall back to Playwright's managed Chromium on other machines.
    }
  }
  browser = await (engine === 'chromium' ? chromium : webkit).launch(options);
  const runs = [];
  for (let index = 0; index < 3; index += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    const externalRequests = [];
    const responses = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(new URL(request.url()).hostname);
    });
    page.on('response', (response) => {
      responses.push(response);
    });
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button', { name: 'Run engine experiment' }).tap();
    await page.waitForFunction(() => Boolean(document.querySelector('#results')?.textContent), undefined, { timeout: 35_000 });
    const result = JSON.parse(await page.locator('#results').innerText());
    const requests = [];
    for (const response of responses) {
      await response.finished();
      const sizes = await response.request().sizes();
      const pathname = new URL(response.url()).pathname;
      const headers = await response.allHeaders();
      const sentHeaders = await response.request().allHeaders();
      const payload = await measurePayload(response.url(), sentHeaders['accept-encoding'] ?? 'identity');
      const contentLength = headers['content-length'];
      requests.push({
        asset: pathname.replace(/^\//, ''),
        status: response.status(),
        reportedBodyBytes: sizes.responseBodySize,
        contentLength: contentLength === undefined ? null : Number(contentLength),
        encoding: headers['content-encoding'] ?? 'identity',
        replayPayloadBytes: payload.bytes,
        replayEncoding: payload.encoding,
      });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    runs.push({ ...result, requests, errors, externalRequests, horizontalOverflow: overflow });
    if (!result.ok || !result.workerContext || result.heartbeats < 2 || errors.length || externalRequests.length || overflow) {
      throw new Error(`Browser check failed: ${JSON.stringify(runs.at(-1))}`);
    }
    await context.close();
  }
  const assets = [];
  for (const file of await readdir('dist/assets')) {
    const data = await readFile(`dist/assets/${file}`);
    assets.push({ name: file, bytes: data.length, gzipBytes: gzipSync(data).length });
  }
  const report = {
    recordedAt: new Date().toISOString(),
    engine: 'PGlite 0.5.12',
    browser: engine,
    browserVersion: browser.version(),
    viewport: '390 x 844, touch enabled',
    context: 'Unthrottled cloud Linux host; three fresh browser contexts; local production preview with CSP. Not an iPhone performance measurement.',
    memoryScope: 'wasmMemoryBytes is allocated WebAssembly linear memory only; excludes JavaScript, filesystem, renderer, and browser overhead. Total or peak memory is not measured.',
    downloadScope: 'Browser-reported sizes may be incomplete for workers. replayPayloadBytes measures each observed request replayed via Node HTTP with the browser Accept-Encoding, counting the encoded body before decompression. Excludes HTTP headers/TLS. Built asset bytes and computed gzip estimates are separate. This is not a mobile-network benchmark.',
    runs,
    assets,
  };
  await writeFile(`docs/spike-${engine}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    browser: report.browser,
    browserVersion: report.browserVersion,
    startupMs: runs.map((run) => Math.round(run.startupMs)),
    workerRoundTripMs: runs.map((run) => Math.round(run.workerRoundTripMs)),
    wasmMemoryBytes: runs.map((run) => run.wasmMemoryBytes),
    heartbeats: runs.map((run) => run.heartbeats),
    assetBytes: assets.reduce((total, item) => total + item.bytes, 0),
    gzipAssetBytes: assets.reduce((total, item) => total + item.gzipBytes, 0),
    replayPayloadBytes: runs.map((run) => run.requests.reduce((total, request) => total + request.replayPayloadBytes, 0)),
    checksPerRun: runs[0].checks.length,
  }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
