// Offline service worker for the Larkspur SQL Desk. vite.config.ts writes it to dist/sw.js, replacing the two placeholders below.
// The app shell is precached. Hashed assets are cached on first use, so the SQL editor and the engine work offline once a SQL
// screen has been opened. The engine is never precached: its files are large and only needed by a SQL screen.
const BUILD_ID = '__BUILD_ID__';
const SHELL = __SHELL__;
const SHELL_CACHE = `shell-${BUILD_ID}`;
const ASSET_CACHE = `assets-${BUILD_ID}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
});

// A new worker waits until the page asks for it, so a deploy never reloads a learner in the middle of a query.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !KEEP.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

// The app is one page, so every navigation gets the newest index.html when online and the cached one when not.
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/index.html', response.clone());
    return response;
  } catch {
    const cached = await cache.match('/index.html');
    if (cached) return cached;
    throw new Error('The app shell is not cached yet.');
  }
}

// Hashed files never change under the same name, so a cached copy is always right. Lookups search every cache, so a shell file
// that was precached is found under /assets/ too.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
