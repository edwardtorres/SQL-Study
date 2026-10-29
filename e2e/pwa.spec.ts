import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSidewaysScroll, openTicket } from './helpers';

// Offline use on the production build. A first visit saves the shell. Opening a SQL screen once saves its editor and engine.
// After that the desk loads and a query runs with no connection.
const TICKET = 'Newsletter names B to D';

// The page is controlled once the worker has installed and claimed it. The first visit gets control a moment after load.
async function controlled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  }), { timeout: 30_000 }).toBe(true);
}

for (const width of [390, 1280]) {
  test.describe(`offline use at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('the shell is precached without the engine; a SQL screen opened once keeps working after a reload offline', async ({ page, context }, testInfo) => {
      test.setTimeout(240_000);
      await page.goto('/');
      await controlled(page);

      // The precache list holds the app shell. The engine, the editor and the parser are never in it.
      const worker = await (await page.request.get('/sw.js')).text();
      const shell = worker.match(/^const SHELL = (\[.*\]);$/m)?.[1] ?? '';
      expect(shell).not.toBe('');
      expect(shell).not.toMatch(/pglite|libpg-query|SqlEditor|game\.worker/);

      // Open a SQL screen and run its sample while online. That saves the editor and the engine for offline use.
      await openTicket(page, 1, TICKET);
      await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
      await page.getByRole('button', { name: 'Run sample', exact: true }).tap();
      await expect(page.locator('.results-card table').first()).toBeVisible({ timeout: 40_000 });

      // Offline: the desk reloads from the cached shell, and the same ticket still runs its sample.
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
      await openTicket(page, 1, TICKET);
      await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
      await page.getByRole('button', { name: 'Run sample', exact: true }).tap();
      await expect(page.locator('.results-card table').first()).toBeVisible({ timeout: 40_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`offline-${width}.png`), fullPage: true });
      await context.setOffline(false);
    });

    test('the settings page reports offline use and gives the install steps', async ({ page }) => {
      await page.goto('/');
      await controlled(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Install on iPhone' })).toBeVisible();
      await expect(page.getByText('Available offline.')).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });
  });
}
