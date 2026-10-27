# Browser assets, compression, and local WebKit findings

## Why the original engine build was 17.46 MB

The original spike's 17,459,927-byte raw asset total was predominantly the
PostgreSQL engine and its filesystem, rather than optional extensions:

| Original asset | Raw bytes |
| --- | ---: |
| PostgreSQL WASM | 10,123,263 |
| PGlite filesystem data package | 6,291,000 |
| initdb WASM | 395,242 |
| Engine worker JavaScript | 648,186 |
| Page JavaScript and CSS | 2,236 |

PGlite's installed npm package contains 37 optional extension `.tar.gz` files.
The game imports none of their extension modules and registers no extensions.
Inspection of emitted `dist/assets` confirms that **none of those extension
archives is shipped in the browser build**. Keep that property: do not import
the extension index or copy the package's entire `dist` directory into public
assets.

The core WASM is a precompiled PostgreSQL binary. JavaScript tree-shaking cannot
remove its internals. The `.data` file is an Emscripten filesystem package with
fixed offsets referenced by generated glue; deleting arbitrary bytes is not a
supported trim. No dependency artifacts or checksums were edited to manufacture
a smaller result. Further removal from the engine itself would require a
maintained, verified custom engine build and is outside this step.

The later game also needs a real PostgreSQL parser. Its WASM is emitted as
`assets/libpg-query.wasm`; its raw size is 1,717,872 bytes at this checkpoint.
It is loaded in the SQL worker rather than on the inbox screen. Final full-game
assets therefore must not be compared to the original engine-only build as if
all added JavaScript/parser bytes were engine regressions.

## Actual HTTP compression

The original preview sent PostgreSQL and initdb WASM without HTTP compression.
Its measured replay total was **12,808,938 bytes**. A computed all-assets gzip
estimate was not proof that the server sent compressed WASM.

The Vite build now generates gzip and Brotli siblings for HTML, JavaScript,
CSS, WASM, data and JSON. Its preview middleware negotiates `Accept-Encoding`
and serves compressed bodies with correct `Content-Encoding`, `Content-Length`,
`Vary: Accept-Encoding`, and the original content type. Identity requests still
receive the original bytes and correct MIME type. The same CSP is attached.

Independent HTTP requests verified all three encodings:

| Asset | Identity bytes | gzip bytes | Brotli bytes | Content-Type |
| --- | ---: | ---: | ---: | --- |
| PostgreSQL WASM | 10,123,263 | 3,452,854 | 3,042,065 | application/wasm |
| Filesystem data | 6,291,000 | 2,138,827 | 1,296,945 | application/octet-stream |
| initdb WASM | 395,242 | 147,399 | 131,799 | application/wasm |
| PostgreSQL parser WASM | 1,717,872 | 342,219 | 285,511 | application/wasm |

The first successful local WebKit production spike after this change measured
**5,883,486 encoded response-body bytes per run** using gzip, versus the original
12,808,938 bytes: approximately **54% less transferred payload**. These requests
exercised the engine lab, not the full game or parser. The raw checkpoint is in
`spike-webkit.json`; later reruns can update it as the game evolves.

Counts exclude HTTP/TLS overhead. Compression does not reduce the decoded WASM
memory requirement. The production host used in a later deployment must retain
equivalent compression/encoding behavior; copying files to an arbitrary static
host alone does not establish it.

## Local WebKit installation and execution

The retry downloaded Playwright WebKit 27.2 successfully from the official
Playwright host. The cloud machine lacked Linux runtime libraries and has no
administrator installation route. Signed official Debian trixie package indexes
and packages were downloaded into ignored local cache directories, leaving
system apt configuration unchanged. Extracted libraries were linked into the
browser's dependency search directory without overwriting downloaded browser
files.

Packages supplied:

- libgtk-4-1
- libgraphene-1.0-0
- libharfbuzz-icu0
- libmanette-0.2-0
- libhyphen0
- libgles2
- libcairo-script-interpreter2
- libhidapi-hidraw0
- liblzo2-2

Run `bash scripts/setup-local-webkit.sh` from the repository root after
`npm ci` to reproduce the setup. The script is idempotent, keeps apt state under
ignored `.cache`, verifies actual linker resolution, and launches a real WebKit
render smoke test. It supports the selected Debian trixie cloud host; other
operating systems should use Playwright's normal dependency installer.

Actual linker checks found **zero unresolved linked dependencies** across the
GTK and WPE executables/shared libraries. Playwright's separate system-cache
preflight still cannot see the user-space GLES library because it consults
`ldconfig -p`. Local runs therefore use its supported
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` switch to skip that preflight.
This skips neither browser execution nor any SQL/browser assertions. TLS,
package signatures, artifact integrity and browser checksums were not bypassed.
CI uses the normal `playwright install --with-deps` route with no preflight skip.

The local browser launched and rendered a page, then passed all seven SQL spike
checks in each of three fresh touch-enabled 390px contexts. Recorded startup
was 1.93–2.32 seconds and allocated WASM linear memory was 188.56 MiB. The main
UI heartbeat continued, with no page errors, external HTTP origins or page-level
horizontal overflow. See `spike-webkit.json` for exact results and limitations.

This resolves the original local WebKit download blocker. CI results and the
full-game journeys are reported separately; engine-lab success does not replace
those checks.

## Current measurements (October 27, 2026)

Rebuilt from the Larkspur Freight code with the editor fix.

- No PGlite extension archive ships. `dist/` contains no `*.tar.gz`. The game
  imports no extension index, so there was nothing to exclude. This is the answer
  to "why 17.46 MB": the core PostgreSQL WASM (10.12 MB) and its filesystem data
  (6.29 MB) are almost all of it.
- Raw total of all `dist/assets` files: 20,696,290 bytes. The additional
  1.72 MB is the SQL parser WASM, and the rest is the game and editor.
- Engine files are served Brotli-encoded by the preview server. The WASM,
  filesystem data, and initdb sizes are 3,042,065, 1,296,945, and 131,799 bytes
  on the wire, and the parser is 285,511 bytes.
- Transfer through the first SQL screen, counting encoded bodies only:
  Chromium 5,177,707 bytes; WebKit 6,563,229 bytes. The earlier figures were
  5,177,698 and 6,563,219. The engine WASM and data files have the same content hashes
  as the earlier build, so the difference is measurement noise.
- Memory: the warm runtime reports 128 MiB (134,217,728 bytes) with the
  `shared_buffers` tuning. `initialMemory` cannot go lower, since 64 MiB fails
  instantiation.

Before and after: the original engine-only spike served 12,808,938 bytes with mixed
encodings. Trimming changed nothing. The reduction comes from HTTP compression,
which cut the payload by about half. Compression does not reduce decoded WASM
memory.
