// What the publisher uploads, and how each object is labelled. Pure functions: the publisher runs the AWS CLI, and the tests check the plan.
import { posix } from 'node:path';

// The content types the site is published with. The AWS CLI's guesses are not used.
export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const REVALIDATE = 'no-cache';

// The precompressed siblings the build writes beside each hashed asset, and the Content-Encoding each one is published with.
const SIBLINGS = { '.br': 'br', '.gz': 'gzip' };

// Vite puts a content hash in a built name as name-HASH.ext, with an eight-character hash. libpg-query.wasm has none, because its
// parser package loads it by that fixed name, so it is revalidated rather than cached for a year.
export const isHashed = (key) => /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(key);

// The objects to publish, from the built file list. A sibling is published only with the hashed asset it belongs to, and the
// assets come first, so index.html never points at a file that is not yet there.
export function publishPlan(files) {
  const built = new Set(files);
  const entries = [];
  for (const file of [...files].sort()) {
    if (Object.keys(SIBLINGS).some((suffix) => file.endsWith(suffix))) continue;
    const contentType = CONTENT_TYPES[posix.extname(file)] ?? 'application/octet-stream';
    const inAssets = file.startsWith('assets/');
    const cacheControl = inAssets && isHashed(file) ? IMMUTABLE : REVALIDATE;
    entries.push({ key: file, file, contentType, cacheControl });
    if (!inAssets) continue;
    for (const [suffix, contentEncoding] of Object.entries(SIBLINGS)) {
      if (built.has(file + suffix)) entries.push({ key: file + suffix, file: file + suffix, contentType, cacheControl, contentEncoding });
    }
  }
  return entries.sort((a, b) => Number(!a.key.startsWith('assets/')) - Number(!b.key.startsWith('assets/')) || a.key.localeCompare(b.key));
}

// Keys under assets/ that the new build no longer references. Only these are removed, and only after index.html is live.
export function prunable(bucketKeys, plan) {
  const wanted = new Set(plan.map((entry) => entry.key));
  return bucketKeys.filter((key) => key.startsWith('assets/') && !wanted.has(key));
}

// The paths that are not content-hashed, so a deploy takes effect at once.
export const INVALIDATED = ['/', '/index.html', '/404.html', '/sw.js', '/manifest.webmanifest'];
