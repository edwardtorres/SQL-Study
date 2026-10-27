# Juniper Freight · The Data Desk

A browser-only PostgreSQL practice game. Pick up a ticket from a fictional
colleague, try a worked example, edit SQL, and check your answer against three
deterministic datasets.

Step 1 contains three playable sample tickets and the foundation for a
13-chapter curriculum. The complete chapter lessons, rank/skill-tree game loop,
interview mode, PWA/offline support, and deployment remain later roadmap steps.

## Start developing

Use Node 24 (Node 22.12 or newer is supported). From the repository root:

```sh
npm ci
npm run dev
```

Open the development address printed by Vite. The ticket board does not load
PostgreSQL; opening a SQL workspace loads its worker and engine lazily.
No credentials, backend, or database service is required.

## Checks

```sh
npm run check
npm run test:e2e:chromium
npm run benchmark:warm
```

`check` runs lint, Vitest, strict TypeScript/build, and the production debug-hook
scan. Browser journeys use taps at 390px and 1280px and include axe checks,
saved progress, autocomplete, bounded results, and timeout recovery.

Install Playwright browsers and supported Linux dependencies when needed:

```sh
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run spike:chromium
npm run spike:webkit
```

The cross-browser GitHub Actions workflow runs this installation and both browser
projects on every push to main, pull request, or manual dispatch. It saves current
measurements and test artifacts and writes a public job summary.

On this unprivileged Debian trixie amd64 cloud host, system package installation
is unavailable. The repeatable alternative downloads verified Debian packages
into an ignored cache and links their libraries into Playwright's browser dirs:

```sh
bash scripts/setup-local-webkit.sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run test:e2e
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run spike:webkit
```

The local switch skips a system-library-cache preflight that cannot see these
user-space libraries. Actual linker checks and a real WebKit render are required
by the setup script. Browser tests still execute; TLS, package signatures and
artifact verification remain enabled. CI uses normal `--with-deps` without this
switch. Chromium uses a system binary when available; `CHROMIUM_EXECUTABLE` can
override that selection.

Do not run browser commands concurrently: their production previews use port 4173.

## Execution and grading

One warm PGlite worker retains three isolated dataset schemas. Each learner and
reference execution sets its dataset role, search path, and statement timeout
inside a transaction that always rolls back. No learner table changes persist.
AST validation rejects transaction/session escapes and unsupported SQL. Cursor
fetches enforce the 1,000-row default limit before returning rows to the UI.

PGlite's PostgreSQL statement timeout does not reliably interrupt blocking work
in this WASM build. A main-thread deadline terminates the worker (3.5 seconds for
sample queries; 6 seconds for a submission). The next request recreates it.
Normal SQL mistakes roll back without restarting the engine.

Grading compares the learner and reference on one visible and two hidden edge-
case datasets. Ordered tickets compare order; the generic grader also supports
multisets, exact numeric/bigint values, explicit columns/types, and bounded diffs.
Schema-ticket support checks expected-success/failure inserts with savepoints.
The three current tickets are read-query tickets; a schema-ticket UI is later work.

Hidden fixtures are omitted from the normal interface, not encrypted. This is a
client-only learning game; a determined user can inspect bundled content.

## Progress

Drafts, attempts, passes, hints, solution reveals and XP use a version 1
localStorage save. Initial/prerelease migration and corrupt/future-save handling
are tested. A newer or unreadable save is preserved rather than overwritten.
Progress belongs to the current browser; GitHub preserves the application source,
not an individual learner's localStorage. Cross-device sync is not implemented.

Hints cost 10 XP each without locking access. Showing a solution reduces the
available ticket reward. Repeated submissions cannot farm additional XP.

## Evidence and design

- [Original Step 1 prompt](docs/step-1-prompt.md)
- [Curriculum, schema and challenge design](docs/content-design.md)
- [Independent blind content review](docs/content-review.md)
- [Warm execution, isolation, memory and timings](docs/warm-engine-findings.md)
- [Bundle analysis and real compression](docs/bundle-findings.md)
- [Engine experiments](docs/engine-spike.md)
- [Chromium measurements](docs/spike-chromium.json)
- [WebKit measurements](docs/spike-webkit.json)
- [Fictional company name check](docs/name-check.md)
- [Working rules and roadmap](CLAUDE.md)

Fonts are self-hosted Latin subsets; their OFL licenses ship in `public/licenses`.
No external font or SQL service is contacted at runtime. Production serving must
retain the tested CSP (`wasm-unsafe-eval`, no general `unsafe-eval`) and real
Content-Encoding headers for the precompressed WASM/data assets. Vite preview
implements that configuration; later deployment must reproduce it.
