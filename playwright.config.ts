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

// The engine lab is a test page. Only a build made with ENGINE_LAB=1 contains it, so its spec runs only against that build.
const labBuild = process.env.ENGINE_LAB === '1';
const labIgnored = labBuild ? [] : [/engine-lab\.spec\.ts$/];

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
    // The production build. Development-only specs (the short interview set, the crash trigger) run in the dev-interview project.
    { name: 'chromium', testIgnore: [/-dev\.spec\.ts$/, ...labIgnored], use: { browserName: 'chromium', launchOptions: executablePath ? { executablePath } : {} } },
    { name: 'webkit', testIgnore: [/-dev\.spec\.ts$/, ...labIgnored], use: { browserName: 'webkit' } },
    { name: 'dev-interview', testMatch: /(interview|error-boundary)-dev\.spec\.ts$/, use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:5173', launchOptions: executablePath ? { executablePath } : {} } },
  ],
  webServer: [
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
    },
  ],
});
