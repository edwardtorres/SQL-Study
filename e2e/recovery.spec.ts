import { expect, test } from '@playwright/test';
import { openChapter } from './helpers';

test.use({ serviceWorkers: 'block' });

test('a failed ticket download offers recovery instead of an endless spinner', async ({ page }) => {
  await page.route('**/assets/ch1-*.js', (route) => route.abort());
  await page.goto('/');
  await openChapter(page, 1);
  await page.getByRole('button', { name: /Newsletter names B to D/ }).first().click();
  await expect(page.getByText('The ticket could not be downloaded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload desk' })).toBeVisible();
  await page.unroute('**/assets/ch1-*.js');
  await page.getByRole('button', { name: 'Reload desk' }).click();
  await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
  await openChapter(page, 1);
  await page.getByRole('button', { name: /Newsletter names B to D/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Newsletter names B to D', exact: true })).toBeVisible();
});

test('a failed sample run clears results from an earlier successful query', async ({ page }) => {
  await page.goto('/');
  await openChapter(page, 1);
  await page.getByRole('button', { name: /Newsletter names B to D/ }).first().click();
  const run = page.getByRole('button', { name: 'Run sample', exact: true });
  await expect(run).toBeEnabled({ timeout: 35_000 });
  await run.click();
  await expect(page.locator('.results-card table')).toBeVisible();
  await page.locator('.cm-content').fill('SELECT FROM;');
  await run.click();
  await expect(page.locator('.query-error')).toBeVisible();
  await expect(page.locator('.results-card table')).toHaveCount(0);
});

test('grading preserves a draft edited while the worker was checking a submission', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      private delayed = new Set<number>();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event: MessageEvent<{ id: number }>) => {
          if (!this.delayed.delete(event.data.id)) return;
          event.stopImmediatePropagation();
          setTimeout(() => { this.dispatchEvent(new MessageEvent('message', { data: event.data })); }, 800);
        });
      }
      postMessage(message: { id: number; request: { type: string } }) {
        if (message.request.type === 'grade') this.delayed.add(message.id);
        super.postMessage(message);
      }
    };
  });
  await page.goto('/');
  await openChapter(page, 1);
  await page.getByRole('button', { name: /Newsletter names B to D/ }).first().click();
  const submit = page.getByRole('button', { name: 'Submit query', exact: true });
  await expect(submit).toBeEnabled({ timeout: 35_000 });
  await submit.click();
  await expect(submit).toBeDisabled();
  const draft = 'SELECT id FROM customers; -- keep my new draft';
  await page.locator('.cm-content').fill(draft);
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('.cm-content')).toHaveText(draft);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('larkspur-sql-desk.progress') ?? '{}') as { tickets: Record<string, { draft: string }> });
  expect(Object.values(saved.tickets).some((ticket) => ticket.draft === draft)).toBe(true);
});
