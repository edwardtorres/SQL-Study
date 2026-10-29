import { expect, test } from '@playwright/test';
import { expectNoSidewaysScroll, openTicket } from './helpers';

// The live site after a deploy: the office loads, a SQL screen runs a query, and no Content-Security-Policy violation occurs.
// It runs only with SITE_URL set (the live project), so it never runs against a local build.
for (const width of [390, 1280]) {
  test.describe(`live site at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('the live site opens the desk, runs a query, and reports no policy violation', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.addInitScript(() => {
        const violations: string[] = [];
        (window as unknown as { cspViolations: string[] }).cspViolations = violations;
        document.addEventListener('securitypolicyviolation', (event) => {
          violations.push(`${event.violatedDirective} ${event.blockedURI || 'inline'}`);
        });
      });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await openTicket(page, 1, 'Newsletter names B to D');
      await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
      await page.getByRole('button', { name: 'Run sample', exact: true }).tap();
      await expect(page.locator('.results-card table').first()).toBeVisible({ timeout: 40_000 });
      const violations = await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
      expect(violations, `violations on the live site at ${width}px, project ${testInfo.project.name}`).toEqual([]);
    });
  });
}
