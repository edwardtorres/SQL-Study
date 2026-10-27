import type { Page } from '@playwright/test';

// Tap-only navigation from the chapter list. Every helper starts from the home page or a chapter page.
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
