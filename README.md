# Juniper SQL Desk

A planned SQL learning game set at a fictional freight-company data desk.

**Current status: prerequisite engine lab only. Step 1 is not complete.**
PGlite runs in a browser worker in Chromium. Playwright WebKit cannot yet be
downloaded because the environment returns `403 Domain forbidden` from the
official download hosts. This blocks the required engine decision and game build.

- [Original Step 1 requirements](docs/step-1-prompt.md)
- [Implementation plan and proposed curriculum/schema](docs/implementation-plan.md)
- [Engine evidence and outstanding checks](docs/engine-spike.md)
- [Raw Chromium measurements](docs/spike-chromium.json)
- [Working rules and roadmap](CLAUDE.md)

## Run the lab

Use Node 22.12 or newer (validated with Node 24). From the repository root:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open the address printed by Vite in your own development environment and press
**Run engine experiment**. The engine loads on demand into a fresh worker. This
probe has a 30-second startup watchdog; it is not the future challenge grader.
No database or credentials are needed, and the lab does not save user progress.

For repeatable production browser measurements:

```sh
npm run browsers:install
npm run spike:chromium
npm run spike:webkit
```

For the committed tap-only and axe accessibility checks at phone and desktop
widths, run `npm run test:e2e:chromium`. Run `npm run test:e2e` for both browsers
once WebKit is installed; its tests are currently unrun because installation is
blocked. Chromium's two lab tests passed after correcting an invalid ARIA label.

The browser installer retains binaries under ignored dependencies. Chromium
uses a system Chromium when available; `CHROMIUM_EXECUTABLE` can override it.
WebKit uses the Playwright-managed browser. On Linux, missing system libraries
may require Playwright's documented `install-deps` procedure with administrator
access. No browser test is considered passed until it actually executes.

The runner builds/serves production assets, performs three independent phone-
width touch runs under CSP, checks SQL results and UI heartbeats, and updates
only the corresponding raw measurement report. It closes its browser and server.
Do not run the two browser commands concurrently: they use the same preview port.

The real React/Tailwind game, grader, datasets and save system follow after the
WebKit gate passes. The current page is deliberately an engine experiment.
