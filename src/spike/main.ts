import './style.css';

const run = document.querySelector<HTMLButtonElement>('#run')!;
const status = document.querySelector<HTMLElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
let worker: Worker | undefined;

run.addEventListener('click', () => {
  worker?.terminate();
  run.disabled = true;
  results.textContent = '';
  status.textContent = 'Starting a fresh Postgres worker…';
  const started = performance.now();
  let heartbeats = 0;
  let maxGapMs = 0;
  let previous = started;
  const heartbeat = window.setInterval(() => {
    const now = performance.now();
    maxGapMs = Math.max(maxGapMs, now - previous);
    previous = now;
    heartbeats += 1;
  }, 16);
  const finish = (result: Record<string, unknown>) => {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    const output = { ...result, workerRoundTripMs: performance.now() - started, heartbeats, maxGapMs };
    results.textContent = JSON.stringify(output, null, 2);
    status.textContent = result.ok ? 'All engine checks passed.' : 'Engine experiment failed.';
    run.disabled = false;
  };
  const timeout = window.setTimeout(() => {
    worker?.terminate();
    finish({ ok: false, error: 'Engine experiment exceeded 30 seconds.' });
  }, 30_000);
  worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
    finish(event.data);
  };
  worker.onerror = (event) => {
    worker?.terminate();
    finish({ ok: false, error: event.message });
  };
  worker.postMessage({ type: 'run' });
});

const warmRun = document.querySelector<HTMLButtonElement>('#warm-run')!;
const warmStatus = document.querySelector<HTMLElement>('#warm-status')!;
const warmResults = document.querySelector<HTMLElement>('#warm-results')!;
warmRun.addEventListener('click', async () => {
  warmRun.disabled = true;
  warmStatus.textContent = 'Loading one warm engine and three dataset schemas…';
  try {
    const { sqlEngine } = await import('../engine/client');
    const initialization = await sqlEngine.initialize();
    const benchmarks = [];
    for (const challengeId of ['dispatch', 'unbilled', 'latest-event']) {
      benchmarks.push({ challengeId, ...await sqlEngine.benchmark(challengeId) });
    }
    warmResults.textContent = JSON.stringify({ ok: true, initialization, benchmarks }, null, 2);
    warmStatus.textContent = 'Warm grading benchmark completed.';
  } catch (error) {
    warmResults.textContent = JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) });
    warmStatus.textContent = 'Warm grading benchmark failed.';
  } finally { warmRun.disabled = false; }
});
