import { spikeCases } from './cases';

self.onmessage = async () => {
  try {
    const start = performance.now();
    const { PGlite } = await import('@electric-sql/pglite');
    const db = await PGlite.create();
    const startupMs = performance.now() - start;
    const checks = [];
    for (const test of spikeCases) {
      const results = await db.exec(test.sql);
      const rows = results.at(-1)?.rows ?? [];
      const passed = !('expected' in test) || JSON.stringify(rows) === JSON.stringify(test.expected);
      checks.push({ name: test.name, passed, rows });
    }
    const version = await db.query('SELECT version() AS version');
    // This is allocated WASM linear memory, not total tab/process memory.
    const module = db.Module as unknown as { HEAPU8?: Uint8Array };
    self.postMessage({
      ok: checks.every((check) => check.passed),
      startupMs,
      wasmMemoryBytes: module.HEAPU8?.buffer.byteLength ?? null,
      version: version.rows,
      checks,
      workerContext: typeof document === 'undefined',
    });
    // Keep the engine alive for inspection until the caller closes the context.
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
