# Warm-engine execution findings

Recorded at 2026-10-27T17:02:24.722Z (UTC).

## Execution model

One PGlite instance retains three dataset schemas. Each schema and its tables are owned by a separate non-superuser, non-login role. Each run validates its PostgreSQL AST, starts BEGIN, sets LOCAL ROLE, LOCAL search_path and LOCAL statement_timeout, executes, then always ROLLBACKs. DDL and DML are rolled back too. Calls serialize on the same connection. Dataset loading is cached and cannot silently replace retained data. No extensions are requested. The application preserves PGlite.defaultStartParams and adds shared_buffers=16MB, work_mem=4MB, maintenance_work_mem=16MB for these small datasets.

SELECT results use a cursor and FETCH rowLimit + 1, bounding rows before JS allocation. DML RETURNING uses a bounded projection; other schema statements normally return no rows. All result rows are capped before leaving the runtime. The worker supervisor additionally enforces a wall-clock deadline, since PostgreSQL's statement timeout alone must not be treated as a guarantee that synchronous WASM can always be interrupted.

## Node desktop-host warm timings

Ten measured submissions per challenge, following one warm-up. Each submission includes the learner query plus the reference query on each of the three real freight datasets (six transactional executions), SQL validation, and result comparison. Learner SQL is the reference solution for this successful-submission benchmark. Engine startup and seed loading are excluded. Browser/UI/worker message overhead is excluded. These are unthrottled cloud Linux / Node measurements, not an iPhone benchmark.

| Challenge | Minimum ms | Median ms | Maximum ms |
| --- | ---: | ---: | ---: |
| dispatch | 12.24 | 14.85 | 23.06 |
| unbilled | 15.31 | 17.09 | 19.76 |
| latest-event | 24.30 | 28.87 | 32.40 |

PGlite WASM linear memory after all benchmark queries: 134,217,728 bytes (128.00 MiB). Total/peak process memory is not measured.

## Initial-memory investigation

PGlite 0.5.12 exposes an initialMemory option measured in bytes. Explicit 64 MiB fails WebAssembly instantiation: the memory import is 1024 pages but the compiled module declares a minimum of 2048 pages (128 MiB). Both the default and explicit 128 MiB configurations succeeded and grew to 197,722,112 bytes (188.56 MiB) by database readiness. Lowering initialMemory alone therefore produced no retained-memory reduction for this release. Separately, supported PostgreSQL start parameters lowering shared_buffers from 128MB to 16MB (with work_mem=4MB and maintenance_work_mem=16MB) reduced readiness allocation to 134,217,728 bytes (128 MiB). An 8MB shared-buffer probe also allocated 128 MiB, so the application keeps the larger 16MB cache at the same allocation, while retaining the default initialMemory. Required PGlite default startup flags are preserved. No WASM binary or integrity checksum was changed.

## Isolation evidence

Runtime tests exercise CREATE + INSERT, INSERT into retained tables, DROP, UPDATE, DELETE, error recovery, per-dataset search_path, cached loading, exact bigint/numeric strings, transaction/role/schema escape rejection, SELECT and RETURNING row caps, and concurrent request serialization. Schema grading also validates a candidate once, runs each test insert/change inside an independent SAVEPOINT, rolls back successful and failed probes, and finally rolls back the candidate DDL. Tests cover PK/FK/NOT NULL/UNIQUE/CHECK, a deliberately missing CHECK, explicit datatype failures, and rejection of syntax/access errors as expected constraint failures. The same warm instance survives ordinary SQL failures; timeout/crash/memory recovery is supervised by the worker client.

## Reproduced configuration probes

| initialMemory | Allocated WASM bytes at readiness | Result |
| --- | ---: | --- |
| default | 197722112 | started |
| 128 MiB | 197722112 | started |
| 64 MiB | not instantiated | WebAssembly LinkError: memory import has 1024 pages which is smaller than the declared initial of 2048 |
| application tuning: 16 MB shared buffers | 134217728 | started |

A direct PGlite probe with SET LOCAL statement_timeout = 10 ms and SELECT pg_sleep(0.5) completed in 501.67 ms despite a 10 ms statement_timeout. The main-thread worker deadline must therefore remain the authoritative interrupt/restart path.
