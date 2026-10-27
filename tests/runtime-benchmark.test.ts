import { writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { challenges, datasets, seedSql } from '../src/data';
import { WarmEngine } from '../src/engine/runtime';
import { compareResults, validateSql } from '../src/grader';

describe('real freight datasets on one warm engine', () => {
  let engine: WarmEngine;
  beforeAll(async () => {
    engine = await WarmEngine.create();
    for (const dataset of datasets) await engine.prepare(dataset, seedSql(dataset.seed, dataset.variant));
  }, 30_000);
  afterAll(async () => { await engine?.close(); });

  test.each(challenges)('$id reference passes every dataset and catches its deliberately wrong variant', async (challenge) => {
    let wrongFailures = 0;
    for (const dataset of challenge.datasets) {
      await validateSql(challenge.referenceSql, challenge.structure ? { structure: challenge.structure } : {});
      const expected = await engine.run(dataset.id, challenge.referenceSql);
      const options = { ordered: challenge.ordered, columns: challenge.columns };
      expect(compareResults(expected, expected, options).passed, `${challenge.id}/${dataset.id}: reference column/type contract`).toBe(true);
      for (const variant of challenge.wrongVariants) {
        const wrong = await engine.run(dataset.id, variant.sql);
        if (!compareResults(wrong, expected, options).passed) wrongFailures += 1;
      }
    }
    expect(wrongFailures, `${challenge.id}: wrong variants must fail on some fixture`).toBeGreaterThan(0);
  });

  test('one warm submission includes learner + reference across all three datasets', async () => {
    const measurements: { challenge: string; minMs: number; medianMs: number; maxMs: number; allMs: number[] }[] = [];
    for (const challenge of challenges) {
      const submission = async () => {
        await validateSql(challenge.referenceSql, challenge.structure ? { structure: challenge.structure } : {});
        for (const dataset of challenge.datasets) {
          const learner = await engine.run(dataset.id, challenge.referenceSql);
          const reference = await engine.run(dataset.id, challenge.referenceSql);
          expect(compareResults(learner, reference, { ordered: challenge.ordered, columns: challenge.columns }).passed).toBe(true);
        }
      };
      await submission(); // Warm parser, query planning and per-dataset paths.
      const timings = [];
      for (let count = 0; count < 10; count += 1) {
        const started = performance.now();
        await submission();
        timings.push(performance.now() - started);
      }
      const sorted = [...timings].sort((a, b) => a - b);
      const medianMs = ((sorted[4] ?? 0) + (sorted[5] ?? 0)) / 2;
      const minMs = sorted[0] ?? 0;
      const maxMs = sorted.at(-1) ?? 0;
      measurements.push({ challenge: challenge.id, minMs, medianMs, maxMs, allMs: timings });
      expect(medianMs, `${challenge.id}: warm six-query submission target`).toBeLessThan(1000);
    }
    console.log('WARM_ENGINE_BENCHMARK', JSON.stringify({ measurements, memoryBytes: engine.memoryBytes() }));
    if (process.env.WRITE_ENGINE_REPORT === '1') {
      const rows = measurements.map((item) => `| ${item.challenge} | ${item.minMs.toFixed(2)} | ${item.medianMs.toFixed(2)} | ${item.maxMs.toFixed(2)} |`).join('\n');
      await writeFile('docs/warm-engine-findings.md', `# Warm-engine execution findings\n\nRecorded at ${new Date().toISOString()} (UTC).\n\n## Execution model\n\nOne PGlite instance retains three dataset schemas. Each schema and its tables are owned by a separate non-superuser, non-login role. Each run validates its PostgreSQL AST, starts BEGIN, sets LOCAL ROLE, LOCAL search_path and LOCAL statement_timeout, executes, then always ROLLBACKs. DDL and DML are rolled back too. Calls serialize on the same connection. Dataset loading is cached and cannot silently replace retained data. No extensions are requested. The application preserves PGlite.defaultStartParams and adds shared_buffers=16MB, work_mem=4MB, maintenance_work_mem=16MB for these small datasets.\n\nSELECT results use a cursor and FETCH rowLimit + 1, bounding rows before JS allocation. DML RETURNING uses a bounded projection; other schema statements normally return no rows. All result rows are capped before leaving the runtime. The worker supervisor additionally enforces a wall-clock deadline, since PostgreSQL's statement timeout alone must not be treated as a guarantee that synchronous WASM can always be interrupted.\n\n## Node desktop-host warm timings\n\nTen measured submissions per challenge, following one warm-up. Each submission includes the learner query plus the reference query on each of the three real freight datasets (six transactional executions), SQL validation, and result comparison. Learner SQL is the reference solution for this successful-submission benchmark. Engine startup and seed loading are excluded. Browser/UI/worker message overhead is excluded. These are unthrottled cloud Linux / Node measurements, not an iPhone benchmark.\n\n| Challenge | Minimum ms | Median ms | Maximum ms |\n| --- | ---: | ---: | ---: |\n${rows}\n\nPGlite WASM linear memory after all benchmark queries: ${engine.memoryBytes().toLocaleString('en-US')} bytes (${(engine.memoryBytes() / 1024 / 1024).toFixed(2)} MiB). Total/peak process memory is not measured.\n\n## Initial-memory investigation\n\nPGlite 0.5.12 exposes an initialMemory option measured in bytes. Explicit 64 MiB fails WebAssembly instantiation: the memory import is 1024 pages but the compiled module declares a minimum of 2048 pages (128 MiB). Both the default and explicit 128 MiB configurations succeeded and grew to 197,722,112 bytes (188.56 MiB) by database readiness. Lowering initialMemory alone therefore produced no retained-memory reduction for this release. Separately, supported PostgreSQL start parameters lowering shared_buffers from 128MB to 16MB (with work_mem=4MB and maintenance_work_mem=16MB) reduced readiness allocation to 134,217,728 bytes (128 MiB). An 8MB shared-buffer probe also allocated 128 MiB, so the application keeps the larger 16MB cache at the same allocation, while retaining the default initialMemory. Required PGlite default startup flags are preserved. No WASM binary or integrity checksum was changed.\n\n## Isolation evidence\n\nRuntime tests exercise CREATE + INSERT, INSERT into retained tables, DROP, UPDATE, DELETE, error recovery, per-dataset search_path, cached loading, exact bigint/numeric strings, transaction/role/schema escape rejection, SELECT and RETURNING row caps, and concurrent request serialization. Schema grading also validates a candidate once, runs each test insert/change inside an independent SAVEPOINT, rolls back successful and failed probes, and finally rolls back the candidate DDL. Tests cover PK/FK/NOT NULL/UNIQUE/CHECK, a deliberately missing CHECK, explicit datatype failures, and rejection of syntax/access errors as expected constraint failures. The same warm instance survives ordinary SQL failures; timeout/crash/memory recovery is supervised by the worker client.\n`);
    }
  }, 30_000);
});
