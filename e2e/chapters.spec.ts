import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './helpers';
import { expectNoSidewaysScroll, openChapter, openTicket, tabUntil } from './helpers';

const REFERENCE = 'SELECT s.id, s.weight_kg FROM shipments s WHERE s.id <= 12 AND s.weight_kg > (SELECT AVG(weight_kg) FROM shipments) ORDER BY s.id;';
const MIN_VARIANT = 'SELECT s.id, s.weight_kg FROM shipments s WHERE s.id <= 12 AND s.weight_kg > (SELECT MIN(weight_kg) FROM shipments) ORDER BY s.id;';

async function submitSql(page: Page, sql: string): Promise<void> {
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill(sql);
  await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
}

async function waitForEngine(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
}

for (const width of [390, 1280]) {
  test.describe(`chapter 5 at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('lesson prediction, example, guided ticket with a targeted mistake, then a pass; tap-only and axe', async ({ page }, testInfo) => {
      test.setTimeout(150_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => { errors.push(error.message); });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
      await openChapter(page, 5);
      await expect(page.getByRole('heading', { name: 'Queries within queries' })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.getByRole('button', { name: /Open the lesson/ }).tap();
      await expect(page.getByRole('heading', { name: 'Scalar subqueries return one value' })).toBeVisible();
      // The first section's options are shuffled per visit, so the choice is made by its visible text.
      await page.getByLabel('One row for each shipment that is selected').first().check();
      await page.getByRole('button', { name: 'Check my prediction' }).first().tap();
      await expect(page.getByText('Right.').first()).toBeVisible();
      await page.getByRole('button', { name: 'Run example' }).first().tap();
      await expect(page.locator('.results-card table').first()).toBeVisible({ timeout: 40_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`lesson-${width}.png`), fullPage: true });

      await page.getByRole('button', { name: 'Go to practice' }).tap();
      await page.getByRole('button', { name: /Shipments heavier than average/ }).tap();
      await waitForEngine(page);
      await submitSql(page, MIN_VARIANT);
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('MIN was used where the ticket wants the average');
      await submitSql(page, REFERENCE);
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.dataset-feedback')).toHaveCount(3);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      expect(errors).toEqual([]);
    });

    test('three misses unlock the solution; hints reveal in three tiers', async ({ page }) => {
      test.setTimeout(150_000);
      await openTicket(page, 5, 'Drivers who supervise nobody');
      await waitForEngine(page);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await submitSql(page, 'SELECT id, name FROM drivers WHERE id = 99;');
        await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      }
      await expect(page.getByText('Three tries in')).toBeVisible();
      for (let tier = 1; tier <= 3; tier += 1) {
        await page.getByRole('button', { name: `Reveal hint ${tier} · −5 XP`, exact: true }).tap();
        await expect(page.locator('.hint')).toHaveCount(tier);
      }
      await expect(page.locator('.hint')).toHaveCount(3);
      await expect(page.getByRole('button', { name: 'All three hints revealed' })).toBeVisible();
      await page.getByRole('button', { name: 'Show solution · 5 XP after a pass', exact: true }).tap();
      await expect(page.locator('.solution pre')).toContainText('NOT EXISTS');
      await expectNoSidewaysScroll(page);
    });

    test('the boss ticket lists three numbered parts and opens each one', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('/');
      await openChapter(page, 5);
      await expect(page.getByRole('heading', { name: /Boss ticket/ })).toBeVisible();
      await page.getByRole('button', { name: /Part 2 of 3/ }).tap();
      await expect(page.locator('.brief-title .eyebrow')).toContainText('PART 2 OF 3');
      await expect(page.getByRole('heading', { name: /Boss ticket, part 2/ })).toBeVisible();
    });
  });
}

test('scratchpad runs a read-only query on the sample and refuses writes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Open scratchpad/ }).tap();
  await expect(page.getByRole('heading', { name: 'Free query' })).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).tap();
  await expect(page.locator('.results-card table')).toBeVisible({ timeout: 40_000 });
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill('DELETE FROM shipments;');
  await page.getByRole('button', { name: 'Run', exact: true }).tap();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await expectNoSidewaysScroll(page);
});

test('keyboard-only path from the chapter list to the lesson and the scratchpad', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await tabUntil(page, 'Open chapter 5');
  await page.keyboard.press('Enter');
  await tabUntil(page, 'Open the lesson');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Scalar subqueries return one value' })).toBeVisible();
  await page.goto('/');
  await tabUntil(page, 'Open scratchpad');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 35_000 });
  await tabUntil(page, 'SQL query');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.results-card table')).toBeVisible({ timeout: 40_000 });
});

// Keyboard-only submission of a chapter ticket: focus order, typing, Control+Enter, and Submit with Enter.
for (const width of [390, 1280]) {
  test(`keyboard-only chapter ticket submission at ${width}px`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await tabUntil(page, 'Open chapter 5');
    await page.keyboard.press('Enter');
    await tabUntil(page, 'Shipments heavier than average');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
    await tabUntil(page, 'SQL query');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type(REFERENCE.replace(/;$/, ''));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('.results-card table')).toBeVisible({ timeout: 40_000 });
    await tabUntil(page, 'Submit query');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.dataset-feedback')).toHaveCount(3);
  });
}

// Upgrade: a real version 1 save in localStorage must load, keep its drafts and passes, and be rewritten as version 6.
test('a real version 1 save loads with its drafts and passes, then upgrades to version 6', async ({ page }) => {
  test.setTimeout(90_000);
  const v1 = {
    version: 1,
    activeTicket: 'dispatch',
    tickets: {
      dispatch: { draft: 'SELECT id FROM shipments LIMIT 1;', attempts: 1, failures: 0, passed: true, hintTier: 0, solutionRevealed: false, xp: 100 },
    },
  };
  await page.addInitScript((save) => { localStorage.setItem('larkspur-sql-desk.progress', JSON.stringify(save)); }, v1);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Open chapter 1$/ })).toBeVisible();
  await openChapter(page, 1);
  await expect(page.locator('.practice-row .passed-badge')).toHaveCount(1);
  await page.getByRole('button', { name: /The heavy-load shortlist/ }).first().tap();
  await expect(page.getByRole('textbox', { name: 'SQL query', exact: true })).toContainText('LIMIT 1');
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill('SELECT id FROM shipments LIMIT 2;');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('larkspur-sql-desk.progress') ?? 'null')?.version)).toBe(6);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('larkspur-sql-desk.progress') ?? 'null'));
  expect(saved.lessons).toEqual({});
  expect(saved.tickets.dispatch.passed).toBe(true);
});
