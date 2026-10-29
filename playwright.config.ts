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

// SITE_URL names the live site. The live project then runs against it, and no local server starts.
const liveSite = process.env.SITE_URL;
const localServers = [
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
];

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
    { name: 'chromium', testIgnore: [/-dev\.spec\.ts$/, /live\.spec\.ts$/, ...labIgnored], use: { browserName: 'chromium', launchOptions: executablePath ? { executablePath } : {} } },
    { name: 'webkit', testIgnore: [/-dev\.spec\.ts$/, /live\.spec\.ts$/, ...labIgnored], use: { browserName: 'webkit' } },
    { name: 'dev-interview', testMatch: /(interview|error-boundary)-dev\.spec\.ts$/, use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:5173', launchOptions: executablePath ? { executablePath } : {} } },
    // Exists only when SITE_URL is set, so an ordinary run never reaches the live site.
    ...(liveSite ? [{ name: 'live', testMatch: /live\.spec\.ts$/, use: { browserName: 'chromium' as const, baseURL: liveSite, launchOptions: executablePath ? { executablePath } : {} } }] : []),
  ],
  ...(liveSite ? {} : { webServer: localServers }),
});
