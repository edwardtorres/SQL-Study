import { expect, test } from '@playwright/test';

// The dev-only short set: one problem and two minutes. It exists only in development builds, so this spec runs
// against the dev server (see playwright.config.ts, project dev-interview). The production scan proves it absent from the build.

test.describe('short interview set, development build', () => {
  test('a reload keeps the one problem and its clock; the timer ends the set by itself and the results say so', async ({ page }) => {
    test.setTimeout(210_000);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open interview', exact: true }).tap();
    await page.getByRole('button', { name: 'Short set (dev): 1 problem, 2 minutes', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Timed set' })).toBeVisible();
    const problem = await page.locator('.practice-row .practice-title').first().innerText();
    await expect(page.locator('.interview-clock strong')).toContainText('left');
    const clock = await page.locator('.interview-clock strong').innerText();
    expect(clock).toMatch(/^[0-2]:\d\d left$/);

    await page.reload();
    await page.getByRole('button', { name: 'Open interview', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Timed set' })).toBeVisible();
    await expect(page.locator('.practice-row .practice-title').first()).toHaveText(problem);

    // Nothing is submitted, so the timer ends the set on its own, from the saved start time.
    await expect(page.getByRole('heading', { name: 'The timer ended the set' })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText('0 of 1 passed.')).toBeVisible();
  });
});
