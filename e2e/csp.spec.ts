import { expect, test } from '@playwright/test';
import { openTicket } from './helpers';

// The built app runs under the desk's Content-Security-Policy. A journey through the office, a SQL screen, the engine and a
// result must produce no violation. Violations are recorded by the browser, so a blocked style or script fails this test.
test('the built app runs a query under its Content-Security-Policy with no violation', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { cspViolations: string[] }).cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI || 'inline'}`);
    });
  });
  await page.goto('/');
  await openTicket(page, 1, 'Newsletter names B to D');
  await expect(page.getByRole('button', { name: 'Run sample', exact: true })).toBeEnabled({ timeout: 35_000 });
  await page.getByRole('button', { name: 'Run sample', exact: true }).tap();
  await expect(page.locator('.results-card table').first()).toBeVisible({ timeout: 40_000 });
  const violations = await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
  expect(violations, `violations under ${testInfo.project.name}`).toEqual([]);
});
