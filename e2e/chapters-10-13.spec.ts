import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { items } from '../src/data/catalog';
import { expectNoSidewaysScroll, openTicket } from './helpers';

// Chapters 10 to 13: a star-schema design ticket, an SCD2 ticket, an upsert graded after a second run, an index ticket,
// an EXPLAIN plan ticket and an interview ticket. Each test starts from the home page, uses taps only, and runs axe at both widths.
// The submitted answers come from the catalog, so the spec sends exactly the statements the content check verified.

function referenceOf(id: string): string {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown ticket ${id}`);
  return item.referenceSql;
}

function wrongOf(id: string, variant: string): string {
  const found = items.find((candidate) => candidate.id === id)?.wrongVariants.find((candidate) => candidate.id === variant);
  if (!found) throw new Error(`Unknown wrong variant ${id}/${variant}`);
  return found.sql;
}

async function submitSql(page: Page, sql: string): Promise<void> {
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill(sql);
  await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
}

async function waitForEngine(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
}

for (const width of [390, 1280]) {
  test.describe(`chapters 10 to 13 at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('star schema: a fact without its customer foreign key gets its explanation; the reference passes', async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => { errors.push(error.message); });
      await openTicket(page, 10, 'A shipment fact that points at its customer');
      await waitForEngine(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await submitSql(page, wrongOf('c10-i2', 'i2-no-fk'));
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('REFERENCES clause was left out');
      await submitSql(page, referenceOf('c10-i2'));
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      expect(errors).toEqual([]);
    });

    test('SCD2: a new region version added without closing the old one gets its explanation; the reference passes', async ({ page }) => {
      test.setTimeout(120_000);
      await openTicket(page, 11, 'Open the new region version, then close the old one');
      await waitForEngine(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await submitSql(page, wrongOf('c11-i4', 'i4-no-close'));
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('old version was never closed');
      await submitSql(page, referenceOf('c11-i4'));
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('upsert run twice: a plain insert fails the second run and gets its explanation; the upsert passes', async ({ page }) => {
      test.setTimeout(120_000);
      await openTicket(page, 11, 'Keep each customer');
      await waitForEngine(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await submitSql(page, wrongOf('c11-g1', 'g1-no-conflict'));
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('ON CONFLICT clause was left out');
      await submitSql(page, referenceOf('c11-g1'));
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('index: an index on the wrong column gets its explanation; the index on shipment_id passes', async ({ page }) => {
      test.setTimeout(120_000);
      await openTicket(page, 12, 'Index the scans by shipment');
      await waitForEngine(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await submitSql(page, wrongOf('c12-g1', 'g1-wrong-column'));
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('covers id, the primary key');
      await submitSql(page, referenceOf('c12-g1'));
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('EXPLAIN item: a cast that hides the primary key gets its explanation; the plain key lookup passes', async ({ page }) => {
      test.setTimeout(120_000);
      await openTicket(page, 12, 'Find one scan without reading the table');
      await waitForEngine(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await submitSql(page, wrongOf('c12-g2', 'g2-cast'));
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('id was cast to text');
      await submitSql(page, referenceOf('c12-g2'));
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('interview: the lightest two per customer gets its explanation; the two heaviest pass', async ({ page }) => {
      test.setTimeout(120_000);
      await openTicket(page, 13, 'The two heaviest shipments per customer');
      await waitForEngine(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await submitSql(page, wrongOf('c13-g1', 'g1-lightest-first'));
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('sorted lightest first');
      await submitSql(page, referenceOf('c13-g1'));
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });
  });
}
