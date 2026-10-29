import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The error boundary, on the development server, because the crash trigger exists only in development builds.
const SAVE_KEY = 'larkspur-sql-desk.progress';

async function crash(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).tap();
  await page.getByRole('button', { name: 'Crash this page (dev)', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'The desk stopped' })).toBeVisible();
}

test.describe('error boundary', () => {
  test.setTimeout(90_000);

  test('a crash with no saved progress says so, and offers a reload', async ({ page }) => {
    await crash(page);
    // The app writes its save on load, so the empty case is made after the crash: the stored save is removed first.
    await page.evaluate((key) => { localStorage.removeItem(key); }, SAVE_KEY);
    await page.getByRole('button', { name: 'Export raw save', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText('No saved progress was found in this browser.');
    await expect(page.getByRole('button', { name: 'Reload the desk', exact: true })).toBeVisible();
  });

  test('a crash exports the stored save exactly as it is stored', async ({ page }, testInfo) => {
    const stored = JSON.stringify({ version: 6, note: 'kept exactly as stored' });
    await page.addInitScript(({ key, value }) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      } catch {
        // Storage can be blocked. The test then fails on what it sees.
      }
    }, { key: SAVE_KEY, value: stored });
    await crash(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export raw save', exact: true }).tap(),
    ]);
    expect(download.suggestedFilename()).toBe('larkspur-progress-raw.json');
    const file = testInfo.outputPath('larkspur-progress-raw.json');
    await download.saveAs(file);
    expect(readFileSync(file, 'utf8')).toBe(stored);
  });
});
