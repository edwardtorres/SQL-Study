# PostgreSQL engine evidence

## Engine choice

**PGlite 0.5.12 / PostgreSQL 18.6.** Both Chromium and Playwright WebKit execute
CREATE TABLE, INSERT, JOIN, CTE, ROW_NUMBER, ON CONFLICT and MERGE successfully.
Each browser report contains three fresh-context capability runs. DuckDB-WASM
was not needed: no PGlite-WebKit engine incompatibility was found.

The capability probe intentionally starts fresh to measure startup. The game
uses the separate warm transactional runtime described below; it does not create
a database for every submission.

## Warm execution model

The SQL screen lazily loads one worker. That worker prepares three dataset schemas
once and retains them across tickets. Each learner/reference query sets a
restricted schema-owner role, search_path and statement_timeout inside
BEGIN/ROLLBACK. Parser checks disallow transaction/session escapes. Schema probes
use independent savepoints and roll back candidate DDL and test inserts too.

PostgreSQL statement_timeout did not interrupt pg_sleep in this WASM build.
The main thread therefore terminates a runaway worker at its hard deadline,
then initializes a replacement for the next queued operation. Ordinary SQL errors
roll back without replacing the engine. Request timers start when dispatched,
not while waiting behind another operation.

## Local browser warm timings

Ten measured successful submissions per ticket after warm-up. Every submission
runs learner plus reference across all three datasets (six transactions), parses
SQL and compares results. The measured worker elapsed time excludes initial
engine/schema loading and the main-thread message round trip. Measurements use
an unthrottled Linux host, not an iPhone.

| Browser | Dispatch median/max ms | Billing median/max ms | Window median/max ms | Warm WASM MiB |
| --- | ---: | ---: | ---: | ---: |
| chromium | 22.00 / 31.80 | 16.90 / 20.20 | 28.60 / 34.40 | 128.00 |
| webkit | 10.00 / 13.00 | 14.00 / 21.00 | 19.00 / 21.00 | 128.00 |

All measured warm submissions were well under 1 second. Node measurements and
repeatable memory configuration probes are in [warm-engine-findings.md](warm-engine-findings.md).

## Bundle and memory

Original engine-probe assets were 17,459,927 bytes raw; the original mixed-encoding
HTTP replay transferred 12,808,938 bytes. The large files are core PostgreSQL WASM,
its filesystem data, initialization WASM and the JS wrapper. No optional extension
archives were imported originally or in the final build, so there were no unused
extension archives to remove. Core WASM/data were not rewritten or stripped.

The final build includes the game, editor, parser, fonts and engine lab. Its raw
asset-directory total is 20,696,275 bytes; not all those files load on a game screen.
Actual request replays with the browsers' accepted encodings measure:

| Browser | Initial ticket board bytes | First SQL screen additional bytes | Total through first SQL screen bytes |
| --- | ---: | ---: | ---: |
| chromium | 159,999 | 5,017,699 | 5,177,698 |
| webkit | 165,808 | 6,397,411 | 6,563,219 |

No WASM/data is requested before a SQL screen opens. WASM, data, parser JS and
other eligible resources have real gzip/Brotli Content-Encoding headers and
correct MIME types. Fonts use their native WOFF2 compression. These are encoded
body-byte measurements from observed-request replays, excluding HTTP headers/TLS;
they are not mobile download-time measurements. The full game adds features, so
its payload scope differs from the original tiny engine probe.

initialMemory 64 MiB cannot instantiate the compiled 128 MiB-minimum module. Default
and explicit 128 MiB alone grew to 188.56 MiB at readiness. Supported PostgreSQL
buffer tuning instead lowers the actual warm allocation to 128 MiB, including the
three loaded datasets. This is allocated linear memory, not total/peak browser
memory. See the detailed [bundle findings](bundle-findings.md).

## CSP and cross-browser execution

The tested production policy allows wasm-unsafe-eval, does not enable general
unsafe-eval, and restricts runtime origins to self. PGlite's distributed code still
emits eval build warnings; no warning was suppressed by weakening the CSP.

WebKit now installs locally. Its missing Debian libraries are installed into an
ignored user cache via signed official packages. The documented local setup
verifies all linked libraries and launches the real browser; its system-cache
preflight switch skips no browser tests and bypasses no artifact verification.
GitHub Actions uses the normal playwright install --with-deps route instead.

The first CI Chromium job passed. Its first WebKit job timed out during browser
installation on the migrating ubuntu-latest image, before engine execution.
The permanent matrix now pins Ubuntu 24.04 and reruns both browsers. Consult the
current Actions run and its public summaries for the final CI outcome; do not
mistake a local report committed here for CI-generated evidence.

## Raw evidence

- [Chromium capability and warm benchmark](spike-chromium.json)
- [WebKit capability and warm benchmark](spike-webkit.json)
- [Chromium complete app payload](app-transfer-chromium.json)
- [WebKit complete app payload](app-transfer-webkit.json)
- [Independent content review](content-review.md)

Actual iPhone hardware, production hosting and offline/PWA behavior remain later
validation. No deployment has been performed.
