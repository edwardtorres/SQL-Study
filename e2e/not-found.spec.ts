import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoSidewaysScroll } from './helpers';

// An unknown address shows the 404 page with status 404, and the page links back to the office.
for (const width of [390, 1280]) {
  test.describe(`not found at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('an unknown address answers 404 with a page that says so, and the link returns to the office', async ({ page }) => {
      const response = await page.goto('/no-such-page');
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectNoSidewaysScroll(page);
      await page.getByRole('link', { name: 'Return to the office' }).tap();
      await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
    });
  });
}
