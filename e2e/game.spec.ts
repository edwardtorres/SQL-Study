import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`all three tickets, tap-only navigation and axe at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    const wasmRequests: string[] = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    page.on('request', (request) => { if (request.url().endsWith('.wasm')) wasmRequests.push(request.url()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Your first day/ })).toBeVisible();
    expect(wasmRequests).toHaveLength(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`board-${width}.png`), fullPage: true });
    for (let index = 0; index < 3; index += 1) {
      const cards = page.locator('.ticket-card');
      await cards.nth(index).getByRole('button', { name: /Open ticket|Continue ticket|Revisit ticket/ }).tap();
      await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
      await page.getByRole('button', { name: 'Before you start: a quick field guide' }).tap();
      await page.getByRole('button', { name: 'Run example', exact: true }).tap();
      await expect(page.locator('.results-card table')).toBeVisible();
      await page.getByRole('button', { name: 'Before you start: a quick field guide' }).tap();
      if (index === 0) {
        await page.getByRole('button', { name: 'Reveal hint 1 · −10 XP', exact: true }).tap();
        await expect(page.locator('.hint')).toHaveCount(1);
      }
      await page.getByRole('button', { name: 'Show solution · reduced XP', exact: true }).tap();
      await page.getByRole('button', { name: 'Load solution into editor', exact: true }).tap();
      await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.dataset-feedback')).toHaveCount(3);
      await expect(page.locator('.dataset-feedback summary strong', { hasText: 'Passed' })).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (index === 0) await page.screenshot({ path: testInfo.outputPath(`workspace-${width}.png`), fullPage: true });
      await page.locator('.workspace-toolbar').getByRole('button', { name: 'Ticket board', exact: true }).tap();
    }
    await expect(page.locator('.passed-badge')).toHaveCount(3);
    await expect(page.locator('.xp')).toContainText('65 XP');
    await page.reload();
    await expect(page.locator('.passed-badge')).toHaveCount(3);
    await expect(page.locator('.xp')).toContainText('65 XP');
    expect(errors).toEqual([]);
  });
}

test('query deadline stops worker and the next query recovers; rows are capped', async ({ page }) => {
  test.setTimeout(65_000);
  let workers = 0;
  page.on('worker', () => { workers += 1; });
  await page.goto('/');
  await page.locator('.ticket-card').first().getByRole('button', { name: 'Open ticket' }).tap();
  const run = page.getByRole('button', { name: 'Run sample', exact: true });
  await expect(run).toBeEnabled({ timeout: 35_000 });
  const editor = page.getByRole('textbox', { name: 'SQL query', exact: true });
  const healthyWorkers = workers;
  await editor.fill('SELECT \"out of memory\" FROM shipments;');
  await run.tap();
  await expect(page.getByRole('alert')).toContainText('does not exist');
  expect(workers).toBe(healthyWorkers);
  await editor.fill('SELECT pg_sleep(10);');
  await run.tap();
  await expect(page.getByRole('alert')).toContainText('time limit reached', { timeout: 10_000 });
  await editor.fill('SELECT id FROM shipments ORDER BY id LIMIT 1;');
  await run.tap();
  await expect(page.locator('.results-card tbody tr')).toHaveCount(1, { timeout: 15_000 });
  await editor.fill('SELECT s.id FROM shipments s CROSS JOIN shipments t;');
  await run.tap();
  await expect(page.getByRole('alert')).toContainText('1000-row limit');
  await editor.fill('SELECT id FROM shipments ORDER BY id LIMIT 2;');
  await run.tap();
  await expect(page.locator('.results-card tbody tr')).toHaveCount(2);
});

test('schema-aware editor, keyword taps, failures and saved drafts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.ticket-card').first().getByRole('button', { name: 'Open ticket' }).tap();
  await expect(page.getByRole('button', { name: 'Submit query', exact: true })).toBeEnabled({ timeout: 35_000 });
  const editor = page.getByRole('textbox', { name: 'SQL query', exact: true });
  await editor.fill('');
  await page.getByRole('button', { name: 'Insert SELECT', exact: true }).tap();
  await expect(editor).toContainText('SELECT');
  await editor.fill('SELECT * FROM ship');
  await expect(page.locator('.cm-completionLabel', { hasText: /^shipments$/ })).toBeVisible({ timeout: 5000 });
  await page.locator('.cm-completionLabel', { hasText: /^shipments$/ }).tap();
  await page.getByLabel('Explore a table').selectOption('customers');
  await expect(page.getByRole('region', { name: 'customers sample rows' })).toBeVisible();
  await editor.fill('SELECT id, tracking_code, weight_kg FROM shipments LIMIT 1;');
  await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Not quite there. Keep investigating.' })).toBeVisible();
  await page.locator('.dataset-feedback').first().locator('summary').tap();
  await expect(page.locator('.dataset-feedback').first()).toContainText('Missing rows');
  await page.reload();
  await page.locator('.ticket-card').first().getByRole('button', { name: 'Continue ticket' }).tap();
  await expect(editor).toContainText('LIMIT 1');
});

test('future save is not overwritten by this version', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('juniper-sql-desk.progress', '{"version":2,"futureData":"preserve"}'); });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('newer app version');
  await page.locator('.ticket-card').first().getByRole('button', { name: 'Open ticket' }).tap();
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill('SELECT 1;');
  expect(await page.evaluate(() => localStorage.getItem('juniper-sql-desk.progress'))).toBe('{"version":2,"futureData":"preserve"}');
});
