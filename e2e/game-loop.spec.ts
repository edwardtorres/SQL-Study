import { readFileSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSidewaysScroll, masterChaptersThrough, tabUntil } from './helpers';

// Reference queries from the chapter item definitions, typed the way a learner would type them.
const REF = {
  g1: "SELECT tracking_code, status FROM shipments WHERE status = 'delivered' ORDER BY id;",
  g2: "SELECT id, weight_kg FROM shipments WHERE status = 'queued' AND weight_kg >= 500 ORDER BY id;",
  g3: "SELECT id, route_id, booked_at FROM shipments WHERE route_id IN (2, 4) AND booked_at BETWEEN '2026-01-01T00:00:00Z' AND '2026-01-31T23:59:59.999999Z' ORDER BY id;",
  b1: "SELECT id, weight_kg FROM shipments WHERE status = 'queued' AND weight_kg BETWEEN 500 AND 900 ORDER BY id;",
  b2: "SELECT id, tracking_code FROM shipments WHERE tracking_code LIKE '%-001_' ORDER BY id;",
  b3: "SELECT id, weight_kg FROM shipments WHERE status = 'in_transit' AND weight_kg IS NOT NULL ORDER BY weight_kg DESC, id ASC LIMIT 3;",
  // The same rows as b1, written in a different order, so it is a new pass rather than a copy of the reveal.
  b1Variant: "SELECT id, weight_kg FROM shipments WHERE weight_kg BETWEEN 500 AND 900 AND status = 'queued' ORDER BY id;",
  c3b1: 'SELECT (booked_at AT TIME ZONE \'UTC\')::date AS booking_day, COUNT(*)::integer AS bookings FROM shipments WHERE booked_at >= \'2026-01-01T00:00:00Z\' AND booked_at < \'2026-02-01T00:00:00Z\' GROUP BY booking_day HAVING COUNT(*) >= 2 ORDER BY booking_day;',
  c3b2: 'SELECT s.customer_id, COUNT(DISTINCT s.id)::integer AS shipments, SUM(i.amount) AS billed FROM shipments s LEFT JOIN invoices i ON i.shipment_id = s.id GROUP BY s.customer_id ORDER BY s.customer_id;',
};

const PASSED = 'Ticket passed. Nice work.';

async function openDesk(page: Page, chapter: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`Open chapter ${chapter}$`) }).tap();
}

// Submits a query in the open ticket and waits for the expected verdict.
async function submitQuery(page: Page, sql: string, verdict: string = PASSED): Promise<void> {
  await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill(sql);
  await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
  await expect(page.getByRole('heading', { name: verdict })).toBeVisible({ timeout: 20_000 });
}

const desk = (page: Page, position: number) => page.locator('.desk').nth(position);

for (const width of [390, 1280]) {
  test.describe(`game loop at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('master chapter 1 through its boss after one prediction; chapter 2 opens; XP, streak and the first-try badge update', async ({ page }, testInfo) => {
      test.setTimeout(300_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => { errors.push(error.message); });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Your desks' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Locked' }).first()).toBeDisabled();
      await expect(page.getByText('Master chapter 1 to open this desk.')).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`office-${width}.png`), fullPage: true });

      await openDesk(page, 1);
      await page.getByRole('button', { name: /Open the lesson/ }).tap();
      await page.getByLabel('3 rows').first().check();
      await page.getByRole('button', { name: 'Check my prediction' }).first().tap();
      await expect(page.getByText('Right.').first()).toBeVisible();

      for (const [title, sql] of [['Read the delivered list', REF.g1], ['Queued and heavy', REF.g2], ['January bookings on two routes', REF.g3]] as const) {
        await openDesk(page, 1);
        await page.getByRole('button', { name: new RegExp(title) }).first().tap();
        await submitQuery(page, sql);
      }
      await expect(page.locator('.topbar .xp')).toContainText('45 XP');
      await page.goto('/');
      await expect(page.locator('.office-stat', { hasText: 'Daily streak' })).toContainText('1 day');

      for (const [part, sql] of [[1, REF.b1], [2, REF.b2], [3, REF.b3]] as const) {
        await openDesk(page, 1);
        await page.getByRole('button', { name: new RegExp(`Part ${part} of 3`) }).tap();
        await submitQuery(page, sql);
      }
      await page.goto('/');
      await expect(desk(page, 0).locator('.desk-status')).toHaveText('Mastered');
      await expect(desk(page, 1).locator('.desk-status')).toHaveText('Open');
      await expect(page.getByRole('button', { name: /Open chapter 2$/ })).toBeEnabled();
      await expect(page.locator('.badge.is-earned', { hasText: 'Boss, first try' })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      expect(errors).toEqual([]);
    });

    test('test out of chapter 1 with the boss alone: the desk and the chapter show Mastered by test-out', async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto('/');
      await page.getByRole('button', { name: 'Boss test-out', exact: true }).tap();
      await submitQuery(page, REF.b1);
      await openDesk(page, 1);
      await page.getByRole('button', { name: /Part 2 of 3/ }).tap();
      await submitQuery(page, REF.b2);
      await openDesk(page, 1);
      await page.getByRole('button', { name: /Part 3 of 3/ }).tap();
      await submitQuery(page, REF.b3);
      await page.goto('/');
      await expect(desk(page, 0).locator('.desk-status')).toHaveText('Mastered by test-out');
      await expect(desk(page, 1).locator('.desk-status')).toHaveText('Open');
      await openDesk(page, 1);
      await expect(page.getByText('Mastered by test-out', { exact: true }).first()).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('a revealed boss part does not count: the revealed query is refused, a different query passes it again', async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto('/');
      await page.getByRole('button', { name: 'Boss test-out', exact: true }).tap();
      await page.getByRole('button', { name: 'Show solution · no mastery credit', exact: true }).tap();
      await page.getByRole('button', { name: 'Load solution into editor', exact: true }).tap();
      await submitQuery(page, REF.b1, 'Matches the revealed solution, so it does not count.');
      await openDesk(page, 1);
      await expect(page.getByText('Revealed · pass again')).toBeVisible();
      await page.getByRole('button', { name: /Part 1 of 3/ }).tap();
      await submitQuery(page, REF.b1Variant);
      await openDesk(page, 1);
      await page.getByRole('button', { name: /Part 2 of 3/ }).tap();
      await submitQuery(page, REF.b2);
      await openDesk(page, 1);
      await page.getByRole('button', { name: /Part 3 of 3/ }).tap();
      await submitQuery(page, REF.b3);
      await page.goto('/');
      await expect(desk(page, 0).locator('.desk-status')).toHaveText('Mastered by test-out');
    });

    test('keyboard only: focus reaches a desk, Enter opens it, and the chapter page is reachable', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('/');
      await tabUntil(page, 'Open chapter 1');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'All desks' })).toBeVisible();
    });

    test('export downloads the progress file; import asks first, refuses a bad file, and replaces only on confirmation', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.goto('/');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export progress', exact: true }).tap(),
      ]);
      const exported = testInfo.outputPath('larkspur-progress.json');
      await download.saveAs(exported);
      expect(JSON.parse(readFileSync(exported, 'utf8'))).toMatchObject({ version: 4 });
      const future = testInfo.outputPath('future-save.json');
      writeFileSync(future, '{"version":5,"tickets":{}}');
      await page.locator('input[type=file]').setInputFiles(future);
      await expect(page.getByRole('alert')).toContainText('newer version');
      await expect(page.getByRole('heading', { name: 'Replace this browser’s progress?' })).toHaveCount(0);
      await page.locator('input[type=file]').setInputFiles(exported);
      await expect(page.getByRole('heading', { name: 'Replace this browser’s progress?' })).toBeVisible();
      await page.getByRole('button', { name: 'Replace progress', exact: true }).tap();
      await expect(page.getByText('Progress replaced from the file.')).toBeVisible();
      await expectNoSidewaysScroll(page);
    });

    test('a passed chapter 3 boss with chapters 1 and 2 mastered shows the Junior Analyst promotion, which closes on Escape', async ({ page }) => {
      test.setTimeout(240_000);
      await masterChaptersThrough(page, 2);
      await page.goto('/');
      await expect(page.locator('.rank-pill')).toHaveText('Intern');
      await openDesk(page, 3);
      await page.getByRole('button', { name: /Part 1 of 2/ }).tap();
      await submitQuery(page, REF.c3b1);
      await openDesk(page, 3);
      await page.getByRole('button', { name: /Part 2 of 2/ }).tap();
      await submitQuery(page, REF.c3b2);
      await expect(page.getByRole('heading', { name: 'You are now Junior Analyst.' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Back to the desks', exact: true })).toBeFocused();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.rank-pill')).toHaveText('Junior Analyst');
    });
  });
}
