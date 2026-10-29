#!/usr/bin/env node
// Takes the README screenshots from a production preview: the office and a ticket after a run, at phone and desktop widths.
// Usage: npm run build, then serve dist on port 4173 (npm run preview -- --port 4173 --strictPort), then run
//   SHOT_URL=http://127.0.0.1:4173 node scripts/screenshots.mjs
// Images are written to docs/screenshots/. CHROMIUM_EXECUTABLE selects a system Chromium; otherwise Playwright's browser is used.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://127.0.0.1:4173';
const out = 'docs/screenshots';
const sizes = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
try {
  for (const { name, width, height } of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    await page.goto(new URL('/', base).href);
    await expect(page.getByRole('heading', { name: /Your desks/ })).toBeVisible();
    await page.screenshot({ path: join(out, `office-${name}.png`), fullPage: true });

    await page.getByRole('button', { name: /Open chapter 1$/ }).tap();
    await page.getByRole('button', { name: /Newsletter names B to D/ }).first().tap();
    const run = page.getByRole('button', { name: 'Run sample', exact: true });
    await expect(run).toBeEnabled({ timeout: 35_000 });
    await run.tap();
    await expect(page.locator('.results-card table').first()).toBeVisible({ timeout: 40_000 });
    await page.screenshot({ path: join(out, `ticket-${name}.png`) });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`wrote ${sizes.length * 2} screenshots to ${out}`);
