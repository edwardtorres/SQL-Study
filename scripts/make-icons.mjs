// Renders the app icons from the SVG sources in scripts/pwa, using the local Chromium. Run again after changing an SVG.
// The apple-touch icon uses the full-bleed design, because iOS applies its own corner mask.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { chromium } = await import('playwright');

let executablePath = process.env.CHROMIUM_EXECUTABLE;
if (!executablePath) {
  try { executablePath = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(); } catch { /* Use the managed browser. */ }
}

const plain = await readFile('scripts/pwa/icon.svg', 'utf8');
const maskable = await readFile('scripts/pwa/icon-maskable.svg', 'utf8');
const targets = [
  { svg: plain, size: 192, file: 'icon-192.png' },
  { svg: plain, size: 512, file: 'icon-512.png' },
  { svg: maskable, size: 512, file: 'icon-maskable-512.png' },
  { svg: maskable, size: 180, file: 'apple-touch-icon.png' },
];

await mkdir('public/icons', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: executablePath || undefined });
try {
  for (const { svg, size, file } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: `public/icons/${file}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`wrote ${targets.map((target) => target.file).join(', ')}`);
