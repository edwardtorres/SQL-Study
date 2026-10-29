import { describe, expect, test } from 'vitest';
import { IMMUTABLE, INVALIDATED, isHashed, prunable, publishPlan, REVALIDATE } from '../scripts/deploy/plan.mjs';

// A small build with the shapes the real one has: hashed assets with precompressed siblings, an unhashed parser file, and pages.
const built = [
  'index.html', 'index.html.br', 'index.html.gz', 'sw.js', 'sw.js.br', 'manifest.webmanifest', '404.html',
  'icons/icon-192.png', 'licenses/dm-sans-OFL.txt',
  'assets/main-wZvSOKsL.js', 'assets/main-wZvSOKsL.js.br', 'assets/main-wZvSOKsL.js.gz',
  'assets/main-FFfAON9S.css', 'assets/main-FFfAON9S.css.br', 'assets/main-FFfAON9S.css.gz',
  'assets/pglite-C2k-M10h.wasm', 'assets/pglite-C2k-M10h.wasm.br', 'assets/pglite-C2k-M10h.wasm.gz',
  'assets/pglite-k6Y9avCD.data', 'assets/pglite-k6Y9avCD.data.br', 'assets/pglite-k6Y9avCD.data.gz',
  'assets/libpg-query.wasm', 'assets/libpg-query.wasm.br', 'assets/libpg-query.wasm.gz',
  'assets/dm-sans-latin-400-normal-Abc12345.woff2',
];

const find = (plan: ReturnType<typeof publishPlan>, key: string) => {
  const entry = plan.find((item) => item.key === key);
  if (!entry) throw new Error(`no entry for ${key}`);
  return entry;
};

describe('which names are content-hashed', () => {
  test('Vite hashes are recognised, and the parser file is not', () => {
    expect(isHashed('assets/pglite-C2k-M10h.wasm')).toBe(true);
    expect(isHashed('assets/main-wZvSOKsL.js')).toBe(true);
    expect(isHashed('assets/libpg-query.wasm')).toBe(false);
  });
});

describe('the publish plan', () => {
  const plan = publishPlan(built);

  test('the engine is published as hashed, immutable, with its precompressed siblings and their encodings', () => {
    const wasm = find(plan, 'assets/pglite-C2k-M10h.wasm');
    expect(wasm).toMatchObject({ contentType: 'application/wasm', cacheControl: IMMUTABLE });
    expect(wasm.contentEncoding).toBeUndefined();
    expect(find(plan, 'assets/pglite-C2k-M10h.wasm.br')).toMatchObject({ contentType: 'application/wasm', cacheControl: IMMUTABLE, contentEncoding: 'br' });
    expect(find(plan, 'assets/pglite-C2k-M10h.wasm.gz')).toMatchObject({ contentType: 'application/wasm', cacheControl: IMMUTABLE, contentEncoding: 'gzip' });
  });

  test('the filesystem data is octet-stream, with siblings', () => {
    expect(find(plan, 'assets/pglite-k6Y9avCD.data')).toMatchObject({ contentType: 'application/octet-stream', cacheControl: IMMUTABLE });
    expect(find(plan, 'assets/pglite-k6Y9avCD.data.br')).toMatchObject({ contentEncoding: 'br', contentType: 'application/octet-stream' });
  });

  test('scripts and styles keep their text types', () => {
    expect(find(plan, 'assets/main-wZvSOKsL.js').contentType).toBe('text/javascript; charset=utf-8');
    expect(find(plan, 'assets/main-FFfAON9S.css.gz')).toMatchObject({ contentType: 'text/css; charset=utf-8', contentEncoding: 'gzip' });
  });

  test('the parser file has no hash, so it is revalidated, and its siblings with it', () => {
    expect(find(plan, 'assets/libpg-query.wasm')).toMatchObject({ cacheControl: REVALIDATE });
    expect(find(plan, 'assets/libpg-query.wasm.br').cacheControl).toBe(REVALIDATE);
  });

  test('pages, the worker and the manifest are revalidated, and their siblings are not published', () => {
    for (const key of ['index.html', 'sw.js', '404.html', 'manifest.webmanifest']) {
      expect(find(plan, key).cacheControl).toBe(REVALIDATE);
    }
    expect(find(plan, 'sw.js').contentType).toBe('text/javascript; charset=utf-8');
    expect(find(plan, 'manifest.webmanifest').contentType).toBe('application/manifest+json');
    expect(plan.map((entry) => entry.key).some((key) => key === 'index.html.br' || key === 'sw.js.gz')).toBe(false);
  });

  test('the assets come first, so the new index.html never points at a missing file', () => {
    const firstPage = plan.findIndex((entry) => !entry.key.startsWith('assets/'));
    expect(plan.slice(0, firstPage).every((entry) => entry.key.startsWith('assets/'))).toBe(true);
  });

  test('the plan never includes a file the build did not produce', () => {
    const keys = new Set(plan.map((entry) => entry.key));
    for (const key of keys) expect(built).toContain(key);
  });

  test('the fonts and icons have their own types', () => {
    expect(find(plan, 'assets/dm-sans-latin-400-normal-Abc12345.woff2').contentType).toBe('font/woff2');
    expect(find(plan, 'icons/icon-192.png').contentType).toBe('image/png');
  });
});

describe('pruning and invalidation', () => {
  test('only assets the new build does not reference are removed, and never a page', () => {
    const plan = publishPlan(built);
    const bucket = ['assets/main-oldOLD11.js', 'assets/main-oldOLD11.js.br', 'assets/main-wZvSOKsL.js', 'index.html', 'icons/icon-192.png'];
    expect(prunable(bucket, plan)).toEqual(['assets/main-oldOLD11.js', 'assets/main-oldOLD11.js.br']);
  });

  test('the invalidation covers the paths that are not hashed', () => {
    expect(INVALIDATED).toEqual(['/', '/index.html', '/404.html', '/sw.js', '/manifest.webmanifest']);
  });
});
