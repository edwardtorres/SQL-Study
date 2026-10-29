import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSidewaysScroll, openTicket } from './helpers';

// Save protection on the production build: the backup reminder, the one-tap export, the save-failure notice, and the storage answer.
const SAVE_KEY = 'larkspur-sql-desk.progress';
const DAY = 24 * 60 * 60_000;
const REMINDER = /Keep a copy of your progress/;

// A version 6 save with one passed ticket. Its backup record began `daysOld` days ago and has never been exported.
async function seedSave(page: Page, daysOld: number): Promise<void> {
  const now = Date.now();
  const save = {
    version: 6, activeTicket: null, lessons: {}, chapters: {}, readiness: {}, mistakeLog: [], mistakeTotals: { tags: {}, competencies: {} },
    reviews: { tags: {}, items: {} }, reviewRecent: {}, dailyReview: null, interview: null, interviewHistory: [],
    streak: { current: 0, longest: 0, countedDay: null, itemsDay: null, items: [] }, independentRun: 0, longestRun: 0, badges: {},
    tickets: {
      dispatch: {
        draft: 'SELECT id FROM shipments;', attempts: 1, failures: 0, passed: true, hintTier: 0, solutionRevealed: false, xp: 25,
        firstOutcome: 'first-try', firstPassAt: now - daysOld * DAY, passedAt: now - daysOld * DAY, revealedAt: null, repeatDay: null,
      },
    },
    backup: { createdAt: now - daysOld * DAY, lastExportAt: null, reminderSnoozedUntil: null },
  };
  await page.addInitScript(({ key, value }) => {
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be blocked. The test then fails on what it sees.
    }
  }, { key: SAVE_KEY, value: save });
}

for (const width of [390, 1280]) {
  test.describe(`save protection at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('a week without an export shows the reminder; Later hides it for a day', async ({ page }) => {
      await seedSave(page, 8);
      await page.goto('/');
      await expect(page.getByText(REMINDER)).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.getByRole('button', { name: 'Later', exact: true }).tap();
      await expect(page.getByText(REMINDER)).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
      await expect(page.getByText(REMINDER)).toHaveCount(0);
    });

    test('Export now downloads the progress file and hides the reminder', async ({ page }, testInfo) => {
      await seedSave(page, 8);
      await page.goto('/');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export now', exact: true }).tap(),
      ]);
      expect(download.suggestedFilename()).toBe('larkspur-progress.json');
      await download.saveAs(testInfo.outputPath('larkspur-progress.json'));
      await expect(page.getByText(REMINDER)).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    });

    test('a save that cannot be written shows the notice, with an export button', async ({ page }) => {
      await page.goto('/');
      await openTicket(page, 1, 'Newsletter names B to D');
      await page.evaluate(() => {
        Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
      });
      await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill('SELECT 1;');
      await expect(page.getByRole('alert').filter({ hasText: 'Progress could not be saved' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export progress', exact: true })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('Settings says what the browser reports about keeping the site’s storage', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Settings', exact: true }).tap();
      await expect(page.getByText(/Kept for this site|Not kept for this site yet|does not report whether storage is kept/)).toBeVisible();
      await expect(page.getByText(/Safari may delete the website data/)).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });
  });
}
