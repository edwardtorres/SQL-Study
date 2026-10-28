import { test as base, type Page } from '@playwright/test';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

const SAVE_KEY = 'larkspur-sql-desk.progress';

// Marks chapters 1 to `chapter` mastered. The save is written on the first load of a test only, so a reload keeps
// whatever the learner did. Gating tests import from @playwright/test instead and start from a fresh browser.
export async function masterChaptersThrough(page: Page, chapter: number): Promise<void> {
  const chapters = Object.fromEntries(Array.from({ length: chapter }, (_, index) => [String(index + 1), { method: 'boss', masteredAt: 0 }]));
  const save = {
    version: 3, activeTicket: null, tickets: {}, lessons: {}, chapters,
    streak: { current: 0, longest: 0, countedDay: null, itemsDay: null, items: [] }, independentRun: 0, longestRun: 0, badges: {},
  };
  await page.addInitScript(({ key, value }) => {
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be blocked. The test then sees the locked desks and fails on its own terms.
    }
  }, { key: SAVE_KEY, value: save });
}

// Content tests open any desk. The default fixture marks all 13 chapters mastered on the first load.
export const test = base.extend({
  page: async ({ page }, use) => {
    await masterChaptersThrough(page, 13);
    await use(page);
  },
});

// Tap-only navigation from the desk list. Every helper starts from the home page or a chapter page.
export async function openChapter(page: Page, chapter: number): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`Open chapter ${chapter}$`) }).tap();
}

// Opens a ticket by its visible title from a chapter's practice list (or from the boss section).
export async function openTicket(page: Page, chapter: number, title: string): Promise<void> {
  await page.goto('/');
  await openChapter(page, chapter);
  await page.getByRole('button', { name: new RegExp(title) }).first().tap();
}

// Moves focus with Tab until the focused control's accessible label (or text) contains the target.
// document.body is excluded: its text contains every label on the page.
export async function tabUntil(page: Page, label: string, maxTabs = 60): Promise<void> {
  for (let step = 0; step < maxTabs; step += 1) {
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) return '';
      return element.getAttribute('aria-label') ?? element.textContent ?? '';
    });
    if (focused.includes(label)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard focus never reached "${label}" within ${maxTabs} Tab presses.`);
}

// No page-level sideways scroll: the document is no wider than the viewport.
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (widths.scroll > widths.client) throw new Error(`Page scrolls sideways: ${widths.scroll}px content in a ${widths.client}px viewport.`);
}
