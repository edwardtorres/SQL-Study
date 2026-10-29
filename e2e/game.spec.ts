import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './helpers';
import { expectNoSidewaysScroll, openChapter, openTicket, tabUntil } from './helpers';

// The three sample tickets sit in chapters 1, 3 and 8. Each one is opened from its desk.
const samples = [
  { chapter: 1, title: 'The heavy-load shortlist' },
  { chapter: 3, title: 'The phantom unbilled shipment' },
  { chapter: 8, title: 'One reliable latest scan' },
] as const;

for (const width of [390, 1280]) {
  test(`all three sample tickets, tap-only navigation and axe at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    const wasmRequests: string[] = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    page.on('request', (request) => { if (request.url().endsWith('.wasm')) wasmRequests.push(request.url()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
    expect(wasmRequests).toHaveLength(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    for (const sample of samples) {
      await openTicket(page, sample.chapter, sample.title);
      await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
      await page.getByRole('button', { name: 'Before you start: a quick field guide' }).tap();
      await page.getByRole('button', { name: 'Run example', exact: true }).tap();
      await expect(page.locator('.results-card table')).toBeVisible();
      await page.getByRole('button', { name: 'Before you start: a quick field guide' }).tap();
      if (width === 390) {
        await page.getByRole('button', { name: 'Reveal hint 1 · −5 XP', exact: true }).tap();
        await expect(page.locator('.hint')).toHaveCount(1);
      }
      await page.getByRole('button', { name: 'Show solution · 5 XP after a pass', exact: true }).tap();
      await page.getByRole('button', { name: 'Load solution into editor', exact: true }).tap();
      await page.getByRole('button', { name: 'Submit query', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
      // Four datasets: the visible sample plus the nulls, ties and boundary edge cases.
      await expect(page.locator('.dataset-feedback')).toHaveCount(4);
      await expect(page.locator('.dataset-feedback summary strong', { hasText: 'Passed' })).toHaveCount(4);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.locator('.workspace-toolbar').getByRole('button').first().tap();
    }
    await page.goto('/');
    await openChapter(page, 1);
    await expect(page.locator('.practice-row .passed-badge')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('query deadline stops worker and the next query recovers; rows are capped', async ({ page }) => {
  test.setTimeout(65_000);
  let workers = 0;
  page.on('worker', () => { workers += 1; });
  await page.goto('/');
  await openTicket(page, 1, 'The heavy-load shortlist');
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
  await openTicket(page, 1, 'The heavy-load shortlist');
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
  await openTicket(page, 1, 'The heavy-load shortlist');
  await expect(editor).toContainText('LIMIT 1');
});

// Keyboard-only: no tap or click. Focus order, Enter, and Control+Enter must drive the whole ticket.
for (const width of [390, 1280]) {
  test(`keyboard-only ticket flow at ${width}px: open, insert a keyword, type, run and submit`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
    await tabUntil(page, 'Open chapter 1');
    await page.keyboard.press('Enter');
    await tabUntil(page, 'The heavy-load shortlist');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
    await tabUntil(page, 'SQL query');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await tabUntil(page, 'Insert SELECT');
    await page.keyboard.press('Enter');
    // Keyword insertion returns focus to the editor, so typing continues after SELECT.
    await page.keyboard.type("id, tracking_code, weight_kg FROM shipments WHERE status = 'queued' AND weight_kg >= 500 ORDER BY weight_kg DESC, id ASC LIMIT 5;");
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('.results-card table')).toBeVisible({ timeout: 15_000 });
    await tabUntil(page, 'Submit query');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Ticket passed. Nice work.' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.dataset-feedback')).toHaveCount(4);
    expect(errors).toEqual([]);
  });
}

test('future save is not overwritten by this version', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('larkspur-sql-desk.progress', '{"version":7,"futureData":"preserve"}'); });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('newer app version');
  await openTicket(page, 1, 'The heavy-load shortlist');
  await page.getByRole('textbox', { name: 'SQL query', exact: true }).fill('SELECT 1;');
  expect(await page.evaluate(() => localStorage.getItem('larkspur-sql-desk.progress'))).toBe('{"version":7,"futureData":"preserve"}');
});
