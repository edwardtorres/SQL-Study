import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSidewaysScroll, tabUntil } from './helpers';

// Review flows: Daily Review with a regenerated sample, Weak Spots and the needs-review set. These specs seed their own
// save, so they import the plain test: the default fixture would write a fully mastered save first.

const SAVE_KEY = 'larkspur-sql-desk.progress';
const PASSED = 'Ticket passed. Nice work.';
const NOT_QUITE = 'Not quite there. Keep investigating.';

// Reference and wrong queries for chapter 1's "Latest delivery deadlines" ticket, typed the way a learner would type them.
const LATEST_DEADLINES = 'SELECT id, delivery_due FROM shipments ORDER BY delivery_due DESC, id DESC LIMIT 10;';
const WITHOUT_LIMIT = 'SELECT id, delivery_due FROM shipments ORDER BY delivery_due DESC, id DESC;';

const ticket = (fields: Record<string, unknown>) => ({
  draft: '', attempts: 0, failures: 0, passed: false, hintTier: 0, solutionRevealed: false, xp: 0,
  firstOutcome: null, firstPassAt: null, passedAt: null, revealedAt: null, repeatDay: null, ...fields,
});

// Chapter 1 is mastered, so chapter 2 is open and chapter 1's seen tickets are reviewable. The save is written on the
// first load only, so a reload keeps whatever the learner did.
async function seedSave(page: Page, fields: Record<string, unknown>): Promise<void> {
  const save = {
    version: 4, activeTicket: null, tickets: {}, lessons: {}, chapters: { '1': { method: 'boss', masteredAt: 0 } },
    readiness: {}, mistakeLog: [], mistakeTotals: { tags: {}, competencies: {} }, reviews: { tags: {}, items: {} }, reviewRecent: {},
    dailyReview: null, interview: null, interviewHistory: [],
    streak: { current: 0, longest: 0, countedDay: null, itemsDay: null, items: [] }, independentRun: 0, longestRun: 0, badges: {},
    ...fields,
  };
  await page.addInitScript(({ key, value }) => {
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be blocked. The test then fails on what it sees.
    }
  }, { key: SAVE_KEY, value: save });
}

// Two seen tickets: one passed long ago, and one failed twice and never passed.
const seenTickets = () => ({
  'c1-i1': ticket({ attempts: 1, passed: true, passedAt: 1_000, firstPassAt: 1_000, firstOutcome: 'first-try', xp: 35 }),
  'c1-i2': ticket({ attempts: 2, failures: 2, draft: 'SELECT id FROM shipments;' }),
});

// Submits a query in the open ticket and waits for the expected verdict.
async function submitQuery(page: Page, sql: string, verdict: string): Promise<void> {
  await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill(sql);
  await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
  await expect(page.getByRole('heading', { name: verdict })).toBeVisible({ timeout: 20_000 });
}

async function openDailyReview(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Daily Review', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Daily Review' })).toBeVisible();
}

for (const width of [390, 1280]) {
  test.describe(`review at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('Daily Review keeps today’s set on reload, and a failed re-solve regenerates the review sample', async ({ page }, testInfo) => {
      test.setTimeout(300_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => { errors.push(error.message); });
      await seedSave(page, { tickets: seenTickets() });
      await openDailyReview(page);
      await expect(page.getByRole('button', { name: /Latest delivery deadlines/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Newsletter names B to D/ })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`daily-review-${width}.png`), fullPage: true });

      // The set is saved for today, so a reload shows the same two tickets rather than a new draw.
      await page.reload();
      await expect(page.getByText('2 today', { exact: true })).toBeVisible();

      // Attempts so far: 2, so the re-solve runs on the third review sample (C).
      await openDailyReview(page);
      await page.getByRole('button', { name: /Latest delivery deadlines/ }).tap();
      await expect(page.getByText(/Review sample C/)).toBeVisible();
      await submitQuery(page, WITHOUT_LIMIT, NOT_QUITE);

      // The failed attempt moves the ticket on to the fourth sample (D), so the next re-solve is not the same sample.
      await page.goto('/');
      await page.getByRole('button', { name: 'Open Daily Review', exact: true }).tap();
      await page.getByRole('button', { name: /Latest delivery deadlines/ }).tap();
      await expect(page.getByText(/Review sample D/)).toBeVisible();
      await expect(page.getByText(/Review sample C/)).toHaveCount(0);
      await submitQuery(page, LATEST_DEADLINES, PASSED);
      expect(errors).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('Weak Spots ranks competencies, explains the most frequent mistakes, and lists revealed and failed tickets', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await seedSave(page, {
        tickets: {
          ...seenTickets(),
          'c1-i3': ticket({ attempts: 1, solutionRevealed: true, revealedAt: 2_000 }),
          'c1-i4': ticket({ attempts: 1, failures: 1, draft: 'SELECT status FROM shipments;' }),
        },
        mistakeTotals: { tags: { LIMIT_MISSING: 3, TIE_NONDETERMINISTIC: 2 }, competencies: { '1': 5 } },
      });
      await page.goto('/');
      await page.getByRole('button', { name: 'Open Weak Spots', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Weak Spots' })).toBeVisible();
      await expect(page.getByText('Competencies, weakest first')).toBeVisible();
      await expect(page.getByText('Not enough data · 0 of 5 scored').first()).toBeVisible();
      // LIMIT_MISSING has no lesson entry, so its explanation is read from a practice ticket's wrong variant.
      await expect(page.getByText(/LIMIT was left out/).first()).toBeVisible({ timeout: 20_000 });
      // TIE_NONDETERMINISTIC has a lesson entry, which links back to its chapter.
      await expect(page.getByRole('button', { name: 'Lesson, chapter 1', exact: true })).toBeVisible();
      const revealed = page.locator('#weak-revealed').locator('..');
      await expect(revealed.getByRole('button', { name: /Long routes out of hubs 1 and 2/ })).toBeVisible();
      const failed = page.locator('#weak-failed').locator('..');
      await expect(failed.getByRole('button', { name: /Which statuses are in use/ })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`weak-spots-${width}.png`), fullPage: true });
    });

    test('a desk with five misses in its last five reviews shows Needs review and a short review set', async ({ page }) => {
      test.setTimeout(120_000);
      await seedSave(page, {
        tickets: seenTickets(),
        reviewRecent: { '1': ['miss', 'miss', 'miss', 'miss', 'pass'] },
      });
      await page.goto('/');
      const desk = page.locator('.desk').first();
      await expect(desk.locator('.needs-mark .desk-status')).toHaveText('Needs review');
      await desk.getByRole('button', { name: 'Review this desk', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Latest delivery deadlines/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Newsletter names B to D/ })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.getByRole('button', { name: /Newsletter names B to D/ }).tap();
      await expect(page.getByText(/This re-solve runs on Review sample/)).toBeVisible();
    });

    test('keyboard only: focus reaches Open Daily Review from the desks and Enter opens it', async ({ page }) => {
      test.setTimeout(90_000);
      await seedSave(page, { tickets: seenTickets() });
      await page.goto('/');
      await tabUntil(page, 'Open Daily Review');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Daily Review' })).toBeVisible();
    });
  });
}
