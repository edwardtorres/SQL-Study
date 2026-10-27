import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSidewaysScroll, openChapter, openTicket } from './helpers';

// Chapters 7 to 9: set operations, window functions, DDL graded by constraint tests, and transactions.
// Each test starts from the home page, uses taps only, and runs axe at both widths.

const SET_OPS_WRONG = 'SELECT status FROM shipments UNION ALL SELECT status FROM shipment_events ORDER BY status;';
const SET_OPS_REFERENCE = 'SELECT status FROM shipments UNION SELECT status FROM shipment_events ORDER BY status;';
const WINDOW_WRONG = 'WITH ranked AS (SELECT route_id, id, delivery_due, RANK() OVER (PARTITION BY route_id ORDER BY delivery_due) AS position FROM shipments) SELECT route_id, id, delivery_due FROM ranked WHERE position <= 2 ORDER BY route_id, delivery_due, id;';
const WINDOW_REFERENCE = 'WITH ranked AS (SELECT route_id, id, delivery_due, ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY delivery_due, id) AS position FROM shipments) SELECT route_id, id, delivery_due FROM ranked WHERE position <= 2 ORDER BY route_id, delivery_due, id;';
const DDL_WRONG = 'CREATE TABLE carriers (id integer PRIMARY KEY, code text NOT NULL, name text NOT NULL);';
const DDL_REFERENCE = 'CREATE TABLE carriers (id integer PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL);';
const CUSTOMERS_REFERENCE = "BEGIN;\nINSERT INTO customers (id, name, region) VALUES (9, 'Juniper Crate', 'North'), (10, 'Kestrel Mills', NULL);\nCOMMIT;";
const EMPTY_TRANSACTION = 'BEGIN;\nCOMMIT;';
const SLOW_TRANSACTION = "BEGIN;\nINSERT INTO customers (id, name, region) VALUES (9, pg_sleep(10)::text, NULL);\nCOMMIT;";

async function submitSql(page: Page, sql: string): Promise<void> {
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill(sql);
  await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
}

async function runSample(page: Page, sql: string): Promise<void> {
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill(sql);
  await page.getByRole('button', { name: 'Run sample', exact: true }).tap();
}

async function waitForEngine(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
}

for (const width of [390, 1280]) {
  test.describe(`chapters 7 to 9 at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('set operations: a guided ticket shows the UNION ALL mistake, then passes with UNION', async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => { errors.push(error.message); });
      await openTicket(page, 7, 'Every status in both feeds');
      await waitForEngine(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await submitSql(page, SET_OPS_WRONG);
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('UNION ALL was used');
      await submitSql(page, SET_OPS_REFERENCE);
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.dataset-feedback')).toHaveCount(3);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      expect(errors).toEqual([]);
    });

    test('window functions: an independent ticket shows the RANK mistake on the visible sample, then passes with ROW_NUMBER', async ({ page }) => {
      test.setTimeout(120_000);
      await openTicket(page, 8, 'Two soonest-due shipments per route');
      await waitForEngine(page);
      await submitSql(page, WINDOW_WRONG);
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('RANK was used');
      await submitSql(page, WINDOW_REFERENCE);
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('DDL: the sample run lists constraint test outcomes; a missing UNIQUE fails the duplicate test and gets its explanation', async ({ page }) => {
      test.setTimeout(120_000);
      await openTicket(page, 9, 'Carrier codes that never repeat');
      await waitForEngine(page);
      await runSample(page, DDL_WRONG);
      await expect(page.locator('.state-tests')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.state-tests .test-failed')).toContainText('duplicate code rejected');
      await expect(page.locator('.state-tests .test-passed')).toHaveCount(2);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await submitSql(page, DDL_WRONG);
      await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.mistake-feedback')).toContainText('UNIQUE was left off code');
      await submitSql(page, DDL_REFERENCE);
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      await expectNoSidewaysScroll(page);
    });

    test('transactions: a kept batch passes; the next run sees no leftover customers', async ({ page }) => {
      test.setTimeout(150_000);
      await openTicket(page, 9, 'Two new customers, kept together');
      await waitForEngine(page);
      await submitSql(page, CUSTOMERS_REFERENCE);
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      await runSample(page, EMPTY_TRANSACTION);
      const customers = page.locator('.state-check', { hasText: 'Customers 9 and up' });
      await expect(customers).toBeVisible({ timeout: 15_000 });
      await expect(customers).not.toContainText('Juniper Crate');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
    });

    test('a slow transaction stops the worker; the next run restarts it on a clean dataset', async ({ page }) => {
      test.setTimeout(150_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => { errors.push(error.message); });
      await openTicket(page, 9, 'Two new customers, kept together');
      await waitForEngine(page);
      await runSample(page, SLOW_TRANSACTION);
      await expect(page.locator('.query-error[role="alert"]')).toContainText('Query time limit reached', { timeout: 30_000 });
      await runSample(page, EMPTY_TRANSACTION);
      const customers = page.locator('.state-check', { hasText: 'Customers 9 and up' });
      await expect(customers).toBeVisible({ timeout: 45_000 });
      await expect(customers).not.toContainText('pg_sleep');
      await expect(customers).not.toContainText('Juniper Crate');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      expect(errors).toEqual([]);
    });
  });
}

test('the chapter list opens chapters 7 to 9 by tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openChapter(page, 9);
  await expect(page.getByRole('heading', { name: /Own the data/ })).toBeVisible();
});
