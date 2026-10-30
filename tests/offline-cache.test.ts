import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('../scripts/pwa/sw.template.js', import.meta.url), 'utf8')
  .replace('__SHELL__', '[]');

for (const mode of ['networkFirst', 'cacheFirst']) {
  for (const failure of ['open', 'put', 'match']) {
    test(`${mode} serves online responses when cache ${failure} fails`, async () => {
      const response = new Response('online resource');
      const unavailable = () => Promise.reject(new Error('Storage unavailable'));
      const caches = {
        match: failure === 'match' ? unavailable : vi.fn(async () => undefined),
        open: failure === 'open' ? unavailable : vi.fn(async () => ({ put: failure === 'put' ? unavailable : vi.fn(), match: vi.fn(async () => new Response('older cached shell')) })),
      };
      const context = { self: { addEventListener: vi.fn() }, caches, fetch: vi.fn(async () => response) };
      runInNewContext(source, context);
      const result = await runInNewContext(`${mode}({})`, context) as Response;
      expect(await result.text()).toBe('online resource');
      expect(context.fetch).toHaveBeenCalledOnce();
    });
  }
}

test('navigation falls back to the installed shell when the network fails', async () => {
  const context = {
    self: { addEventListener: vi.fn() },
    caches: {
      match: vi.fn(async () => new Response('offline shell')),
      open: vi.fn(async () => ({ match: vi.fn(async () => new Response('offline shell')) })),
    },
    fetch: vi.fn(async () => { throw new Error('Offline'); }),
  };
  runInNewContext(source, context);
  const result = await runInNewContext('networkFirst({})', context) as Response;
  expect(await result.text()).toBe('offline shell');
});
