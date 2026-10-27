# Engine spike: partial evidence, not Step 1 completion

PGlite 0.5.12 was the current npm release at the time of the experiment.
The engine identifies itself as PostgreSQL 18.6. Its npm integrity digest is
preserved in the lockfile. No verification was bypassed.

## Decision

**Provisional recommendation: PGlite. Final engine decision blocked on WebKit.**
It runs the target PostgreSQL dialect and passes the tested worker operations
in Chromium. Do not substitute DuckDB just because a browser cannot be
downloaded: no PGlite incompatibility has been observed. DuckDB is reserved
for a demonstrated engine/browser capability failure.

## Chromium observations

The raw evidence is [spike-chromium.json](spike-chromium.json), produced by
`npm run spike:chromium`. The latest run uses system Chromium 154.0.8037.57,
three fresh contexts, a 390 × 844 viewport, touch input, production assets,
and a same-origin CSP with `wasm-unsafe-eval` and without general `unsafe-eval`.

Measured runs (rounded; rerunning the script updates the raw file):

| Measurement | Observation |
| --- | --- |
| Worker import + PostgreSQL readiness | 1.91–1.98 seconds |
| End-to-end worker result, including SQL checks | 1.98–2.05 seconds |
| WASM linear memory after checks | 197,722,112 bytes / 188.56 MiB in every run |
| Main-thread 16ms heartbeat callbacks during work | 123–127 callbacks |
| Largest observed heartbeat interval | 20.2–23.3 ms |
| Built asset payload (before HTTP encoding; excludes HTML) | 17,459,927 bytes / 17.46 MB |
| Computed gzip size of the built assets | 5,892,258 bytes / 5.89 MB |
| Encoded HTTP payload from replaying observed requests | 12,808,938 bytes / 12.81 MB per run |
| SQL operation checks | 7 passed per run, 21 total |
| Page errors / external runtime requests / horizontal overflow | 0 / 0 / none |

SQL operations: CREATE TABLE, INSERT, JOIN, CTE, ROW_NUMBER window function,
INSERT ON CONFLICT and MERGE. Result-bearing queries are compared with expected
rows; their actual returned values are in the raw evidence. Every run uses a
new database and worker.

### What these numbers mean

These are unthrottled cloud-host observations, not iPhone timings or guarantees.
The contexts are fresh, but all three share one browser process; they are not
three fully cold browser/process launches. The worker remains allocated for
inspection until its context closes.
WASM linear memory excludes JS heap, virtual filesystem, rendering and browser
overhead. Total and peak memory have not been measured. This memory allocation
makes the pending WebKit experiment especially important.

The preview serves mixed encodings: WASM was uncompressed while JavaScript and
the data file could be gzip-compressed. Browser request-size reporting returned
zero for the worker script, so summing that field would undercount the download.
The runner retains those raw values and separately replays the observed requests
with the browser's accepted encodings, counting encoded response bytes directly.
That replay excludes HTTP headers/TLS and does not measure an actual mobile
connection. Computed full-asset gzip size is an estimate for a future host that
compresses every asset, not the current browser's total transfer size.

Vite warns about direct eval in PGlite's distributed JS. The tested browser
path passed under the CSP without general `unsafe-eval`; the warning is recorded
rather than suppressed. Verify the same CSP in WebKit before adopting the engine.

## WebKit: blocked, not failed compatibility

`playwright install webkit` could not download Playwright WebKit 27.2 (v2370).
The network proxy returned `403 Domain forbidden` from the official hosts:

- `cdn.playwright.dev`
- `playwright.download.prss.microsoft.com`

No WebKit browser was launched. No WebKit timing, memory, SQL or accessibility
result exists. DuckDB-WebKit was not tested either. This does **not** establish
that either engine fails in WebKit.

The environment draft now includes these browser-download domains, the official
documentation hosts, and a search host for the company-name check. A draft save
does not apply the rules to the running machine. Review and save the changes in
environment settings, then publish the environment as requested by the platform.
After access is applied, run the browser installer and `npm run spike:webkit`.
If the installed browser reports missing Linux libraries, diagnose and install
its supported dependencies before making a compatibility claim.

Official docs and the exact company-name search were also blocked by the proxy.
Do not claim the company name has been cleared or explanations source-reviewed.

## Checks and remaining Step 1 work

Passed: strict TypeScript production build; 2 Vitest tests exercising the real
engine and fresh-database isolation; three production Chromium worker runs.
The SQL checks ran 21 times in Chromium, plus the separate Node test.
Two additional Chromium Playwright tests passed at 390px and 1280px using
tap-only interactions and axe before/after engine execution, with no remaining
axe violations. The first axe run caught an invalid label on the results
element; adding its labelled region role corrected it. No rules were disabled.
The independent reviewer also reran the 2 Vitest tests successfully and checked
the code, SQL outputs, raw evidence and documentation claims. This does not
substitute for the later blind challenge review.

Blocked: WebKit install and the required engine gate; official-document review;
company-name collision check.

Planned but not implemented: React/Tailwind game UI, curriculum as tested data,
eight-table freight seeds, grader/parser/diffs/query caps, three full challenges,
CodeMirror/schema browser, localStorage saves and migrations, React effect lint
rule, production debug-hook checks, Playwright game e2e with axe, and blind
challenge review. The engine lab is not a replacement for these deliverables.
The proposed curriculum and schema are in [implementation-plan.md](implementation-plan.md).

No Step 1 completion audit or Step 2 approval is being requested yet.
