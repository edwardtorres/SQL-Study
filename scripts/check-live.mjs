// Checks the live site's headers and encodings against the built files. Usage: SITE_URL=https://... node scripts/check-live.mjs <dist>
// Reads only: it makes GET requests, and writes nothing.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const site = process.env.SITE_URL;
const dist = process.argv[2] ?? 'dist';
if (!site) throw new Error('SITE_URL must be set.');
const base = site.endsWith('/') ? site : `${site}/`;
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); else console.log(`ok   ${message}`); };

// Plain GET, with the encodings asked for. fetch decodes bodies, so the bytes on the wire come from Content-Length.
async function get(path, acceptEncoding) {
  const response = await fetch(new URL(path, base), { headers: { 'Accept-Encoding': acceptEncoding }, redirect: 'manual' });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, body };
}

const files = await readdir(join(dist, 'assets'));
const wasm = files.find((name) => /^pglite-.*\.wasm$/.test(name));
const script = files.find((name) => /^main-.*\.js$/.test(name));
const wasmBytes = (await stat(join(dist, 'assets', wasm))).size;
const brBytes = (await stat(join(dist, 'assets', `${wasm}.br`))).size;

const page = await get('/', 'identity');
check(page.status === 200, 'the page answers 200');
check(page.headers.get('cache-control') === 'no-cache', 'the page is revalidated on every visit');
check(page.headers.get('strict-transport-security')?.startsWith('max-age=31536000'), 'HSTS is set');
const policy = page.headers.get('content-security-policy') ?? '';
check(policy.includes("script-src 'self' 'wasm-unsafe-eval'"), 'the policy allows WebAssembly in script-src');
check(!/unsafe-eval(?!')/.test(policy) && !policy.includes("'unsafe-eval'"), 'the policy never allows general eval');

const sw = await get('/sw.js', 'identity');
check(sw.status === 200 && sw.headers.get('cache-control') === 'no-cache', 'the offline worker is revalidated');

const missing = await get('/no-such-page', 'identity');
check(missing.status === 404 && missing.body.toString().includes('Page not found'), 'an unknown address gets the 404 page with status 404');

const mainPlain = await get(`assets/${script}`, 'identity');
check(mainPlain.status === 200 && !mainPlain.headers.get('content-encoding'), 'the entry script without Accept-Encoding comes uncompressed');
check(mainPlain.headers.get('cache-control')?.includes('immutable'), 'the hashed entry script is immutable');
const mainBr = await get(`assets/${script}`, 'br, gzip');
check(mainBr.headers.get('content-encoding') === 'br', 'the entry script goes out brotli to a viewer that accepts it');

const engineBr = await get(`assets/${wasm}`, 'gzip, deflate, br, zstd');
check(engineBr.status === 200 && engineBr.headers.get('content-encoding') === 'br', 'the engine goes out brotli to a viewer that accepts it');
check(engineBr.headers.get('content-type') === 'application/wasm', 'the engine is served as application/wasm');
check(Number(engineBr.headers.get('content-length')) === brBytes, `the brotli engine is ${brBytes} bytes on the wire`);
const enginePlain = await get(`assets/${wasm}`, 'identity');
check(!enginePlain.headers.get('content-encoding') && enginePlain.body.length === wasmBytes, `the engine without Accept-Encoding is the full ${wasmBytes} bytes`);

if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('all live checks passed');
}
