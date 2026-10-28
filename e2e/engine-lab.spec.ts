import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './helpers';

for (const width of [390, 1280]) {
  test(`engine lab works using taps with axe checks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    await page.goto('/engine-lab.html');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Run engine experiment' }).tap();
    await expect(page.getByRole('status')).toHaveText('All engine checks passed.', { timeout: 35_000 });
    const output = JSON.parse(await page.getByLabel('Experiment results').innerText()) as {
      workerContext: boolean;
      heartbeats: number;
      checks: { passed: boolean }[];
    };
    expect(output.workerContext).toBe(true);
    expect(output.heartbeats).toBeGreaterThan(1);
    expect(output.checks).toHaveLength(7);
    expect(output.checks.every((check) => check.passed)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
