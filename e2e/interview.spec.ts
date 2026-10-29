import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSidewaysScroll, tabUntil } from './helpers';

// Timed interview sets on the production build. The set's problems are seeded, because a real draw is random:
// the spec must know which problem it submits. The dev-only short set is covered by interview-dev.spec.ts.

const SAVE_KEY = 'larkspur-sql-desk.progress';
const REF_QUEUED_NO_EVENT = "SELECT id FROM shipments WHERE status = 'queued' EXCEPT SELECT shipment_id FROM shipment_events ORDER BY id;";
const PROBLEMS = ['int-09', 'int-01', 'int-02'];

// A save with chapter 1 mastered and a set running. startedAt is relative to now, so the seeded clock can be
// running or already expired.
async function seedSet(page: Page, startedAgoMinutes: number, limitMinutes: number): Promise<void> {
  const save = {
    version: 4, activeTicket: null, tickets: {}, lessons: {}, chapters: { '1': { method: 'boss', masteredAt: 0 } },
    readiness: {}, mistakeLog: [], mistakeTotals: { tags: {}, competencies: {} }, reviews: { tags: {}, items: {} }, reviewRecent: {},
    dailyReview: null, interviewHistory: [],
    interview: {
      id: `set-${Date.now()}`, startedAt: Date.now() - startedAgoMinutes * 60_000, limitMinutes,
      problems: PROBLEMS.map((id) => ({ id, passedAt: null, failures: 0 })),
    },
    streak: { current: 0, longest: 0, countedDay: null, itemsDay: null, items: [] }, independentRun: 0, longestRun: 0, badges: {},
  };
  await page.addInitScript(({ key, value }) => {
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be blocked. The test then fails on what it sees.
    }
  }, { key: SAVE_KEY, value: save });
}

async function submitQuery(page: Page, sql: string): Promise<void> {
  await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill(sql);
  await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
}

for (const width of [390, 1280]) {
  test.describe(`interview at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('a running set keeps its problems and its clock across a reload; a pass shows in the set; finishing shows the results', async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await seedSet(page, 0, 30);
      await page.goto('/');
      await page.getByRole('button', { name: 'Open interview', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Timed set' })).toBeVisible();
      for (const title of ['Queued shipments with no scan event', 'Open shipments past due, per route', 'Customers idle since 22 January']) {
        await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
      }
      const firstClock = await page.locator('.interview-clock strong').innerText();
      expect(firstClock).toMatch(/left/);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`interview-running-${width}.png`), fullPage: true });

      // Reload mid-set: the same three problems, and the clock comes from the saved start, not from a fresh allowance.
      await page.reload();
      await page.getByRole('button', { name: 'Open interview', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Timed set' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Queued shipments with no scan event/ })).toBeVisible();
      await expect(page.locator('.interview-clock strong')).toContainText('left');

      // A pass inside the set: Submit says so, and the list marks the problem. Hints and reveals are not offered.
      await page.getByRole('button', { name: /Queued shipments with no scan event/ }).tap();
      await expect(page.getByRole('button', { name: 'Show solution · no mastery credit' })).toHaveCount(0);
      await expect(page.getByText('Reveal hint 1')).toHaveCount(0);
      await submitQuery(page, REF_QUEUED_NO_EVENT);
      await expect(page.getByRole('heading', { name: 'Passed in this set.' })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Interview set', exact: true }).tap();
      await expect(page.getByRole('button', { name: /Queued shipments with no scan event/ }).locator('.passed-badge')).toBeVisible();

      // Finishing ends the set. The results show each problem, the final query, and the reference solution.
      await page.getByRole('button', { name: 'Finish set', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Set finished' })).toBeVisible();
      await expect(page.getByText('1 of 3 passed.')).toBeVisible();
      await expect(page.getByText('Reference solution').first()).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`interview-results-${width}.png`), fullPage: true });
    });

    test('a set the timer ended while the page was closed is settled on open, and the results say so', async ({ page }) => {
      test.setTimeout(180_000);
      // Started 40 minutes ago with a 30-minute limit: the deadline has passed before the page opens.
      await seedSet(page, 40, 30);
      await page.goto('/');
      await page.getByRole('button', { name: 'Open interview', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'The timer ended the set' })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText('0 of 3 passed.')).toBeVisible();
      await page.getByRole('button', { name: 'All desks', exact: true }).tap();
      await page.getByRole('button', { name: 'Open interview', exact: true }).tap();
      await expect(page.getByText('timer ended the set')).toBeVisible();
    });

    test('keyboard only: Tab reaches Open interview and Enter opens it', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('/');
      await tabUntil(page, 'Open interview');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Timed interview set' })).toBeVisible();
    });
  });
}
