import { execFileSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';

let executablePath: string | undefined = process.env.CHROMIUM_EXECUTABLE;
if (!executablePath) {
  try {
    executablePath = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
  } catch {
    // Use Playwright's managed browser if there is no system Chromium.
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 40_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    hasTouch: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: executablePath ? { executablePath } : {} } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
