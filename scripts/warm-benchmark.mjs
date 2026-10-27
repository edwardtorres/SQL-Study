import { spawnSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/runtime-benchmark.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, WRITE_ENGINE_REPORT: '1' },
});
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  const memory = [];
  for (const initialMemory of [undefined, 128 * 1024 * 1024, 64 * 1024 * 1024]) {
    const setting = initialMemory === undefined ? 'default' : `${initialMemory / 1024 / 1024} MiB`;
    // A rejected Emscripten initialization can also reject an internal promise.
    // Isolate each configuration so the expected unsupported 64 MiB probe
    // cannot abort the supported-configuration measurements or the benchmark.
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { PGlite } from '@electric-sql/pglite';
      const bytes = ${initialMemory ?? 'undefined'};
      try {
        const db = await PGlite.create(bytes === undefined ? {} : { initialMemory: bytes });
        console.log('MEMORY_RESULT ' + JSON.stringify({ allocatedBytes: db.Module.wasmMemory.buffer.byteLength, result: 'started' }));
        await db.close();
      } catch (error) {
        console.log('MEMORY_RESULT ' + JSON.stringify({ allocatedBytes: null, result: error.message }));
      }
    `], { encoding: 'utf8', timeout: 30_000 });
    const line = probe.stdout?.split('\n').find((value) => value.startsWith('MEMORY_RESULT '));
    const expectedLinkError = initialMemory === 64 * 1024 * 1024
      ? probe.stderr?.match(/memory import has 1024 pages which is smaller than the declared initial of 2048/)?.[0]
      : undefined;
    if (!line && !expectedLinkError) throw new Error(`Initial-memory probe did not report a result for ${setting}.`);
    const observation = line ? JSON.parse(line.slice('MEMORY_RESULT '.length))
      : { allocatedBytes: null, result: `WebAssembly LinkError: ${expectedLinkError}` };
    const expectedFailure = initialMemory === 64 * 1024 * 1024 && observation.result.includes('smaller than the declared initial');
    if (probe.status !== 0 && !expectedFailure) throw new Error(`Initial-memory probe failed for ${setting}: ${observation.result}`);
    memory.push({ setting, ...observation });
  }
  const db = await PGlite.create({ startParams: [...PGlite.defaultStartParams,
    '-c', 'shared_buffers=16MB', '-c', 'work_mem=4MB', '-c', 'maintenance_work_mem=16MB'] });
  memory.push({ setting: 'application tuning: 16 MB shared buffers', allocatedBytes: db.Module.wasmMemory.buffer.byteLength, result: 'started' });
  let timeoutOutcome;
  try {
    await db.exec("BEGIN; SET LOCAL statement_timeout = '10ms'");
    const start = performance.now();
    try {
      await db.query('SELECT pg_sleep(0.5)');
      timeoutOutcome = `completed in ${(performance.now() - start).toFixed(2)} ms despite a 10 ms statement_timeout`;
    } catch (error) {
      timeoutOutcome = `errored after ${(performance.now() - start).toFixed(2)} ms: ${error instanceof Error ? error.message : String(error)}`;
    }
  } finally {
    await db.exec('ROLLBACK');
    await db.close();
  }
  console.log('INITIAL_MEMORY_EXPERIMENT', JSON.stringify(memory));
  console.log('STATEMENT_TIMEOUT_EXPERIMENT', timeoutOutcome);
  const rows = memory.map((item) => `| ${item.setting} | ${item.allocatedBytes ?? 'not instantiated'} | ${item.result.replaceAll('|', '\\|')} |`).join('\n');
  await appendFile('docs/warm-engine-findings.md', `\n## Reproduced configuration probes\n\n| initialMemory | Allocated WASM bytes at readiness | Result |\n| --- | ---: | --- |\n${rows}\n\nA direct PGlite probe with SET LOCAL statement_timeout = 10 ms and SELECT pg_sleep(0.5) ${timeoutOutcome}. The main-thread worker deadline must therefore remain the authoritative interrupt/restart path.\n`);
}
