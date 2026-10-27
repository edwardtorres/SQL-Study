import { appendFile, readFile } from 'node:fs/promises';

const browser = process.argv[2];
if (browser !== 'chromium' && browser !== 'webkit') throw new Error('Expected chromium or webkit.');
if (!process.env.GITHUB_STEP_SUMMARY) throw new Error('GITHUB_STEP_SUMMARY is not available.');

const statuses = {
  Lint: process.env.SQL_LINT_OUTCOME ?? 'unknown',
  'Unit/integration tests': process.env.SQL_UNIT_OUTCOME ?? 'unknown',
  'TypeScript and production build': process.env.SQL_BUILD_OUTCOME ?? 'unknown',
  'Production debug-hook scan': process.env.SQL_SCAN_OUTCOME ?? 'unknown',
  'Engine spike': process.env.SQL_SPIKE_OUTCOME ?? 'unknown',
  'Browser journeys and axe': process.env.SQL_BROWSER_OUTCOME ?? 'unknown',
};
const passed = Object.values(statuses).every((status) => status === 'success');
const lines = [
  `## ${browser}: ${passed ? 'all required checks passed' : 'checks failed or did not execute'}`,
  '',
  `Commit: \`${process.env.GITHUB_SHA ?? 'unknown'}\``,
  '',
  '| Check | Outcome |',
  '| --- | --- |',
  ...Object.entries(statuses).map(([name, status]) => `| ${name} | ${status} |`),
  '',
];

// Checkout includes historical reports. Never describe one as a current run
// when the spike step failed or was skipped. The workflow removes its target
// report before running the experiment.
if (statuses['Engine spike'] === 'success') {
  const report = JSON.parse(await readFile(`docs/spike-${browser}.json`, 'utf8'));
  const runs = report.runs ?? [];
  const range = (values, divisor = 1, digits = 2) => {
    const finite = values.filter(Number.isFinite).map((value) => value / divisor);
    return finite.length ? `${Math.min(...finite).toFixed(digits)}–${Math.max(...finite).toFixed(digits)}` : 'unavailable';
  };
  const checkCount = runs.reduce((total, run) => total + (run.checks ?? []).filter((check) => check.passed).length, 0);
  const payloads = runs.map((run) => (run.requests ?? []).reduce((total, request) => total + (request.replayPayloadBytes ?? 0), 0));
  lines.push(
    `Browser: **${report.browserVersion}**. Engine: **${report.engine}**.`,
    '',
    `Recorded at: ${report.recordedAt}. Fresh contexts: ${runs.length}. Passing SQL operation checks: ${checkCount}.`,
    '',
    '| Measurement | Range |',
    '| --- | --- |',
    `| Startup | ${range(runs.map((run) => run.startupMs), 1000)} seconds |`,
    `| Worker round trip | ${range(runs.map((run) => run.workerRoundTripMs), 1000)} seconds |`,
    `| Allocated WASM linear memory | ${range(runs.map((run) => run.wasmMemoryBytes), 1048576)} MiB |`,
    `| Replayed encoded HTTP payload | ${range(payloads, 1000000)} MB |`,
    '',
    'These are runner observations, not iPhone measurements. Memory excludes browser/JavaScript overhead. Payload excludes HTTP headers and TLS.',
    'See the uploaded browser evidence artifact for complete raw results.',
    '',
  );
  if (report.warmGrading?.ok) {
    lines.push('### Warm submissions: learner + reference across three datasets', '', '| Ticket | Median ms | Maximum ms |', '| --- | ---: | ---: |');
    for (const benchmark of report.warmGrading.benchmarks) lines.push(`| ${benchmark.challengeId} | ${benchmark.medianMs.toFixed(2)} | ${benchmark.maxMs.toFixed(2)} |`);
    lines.push('', `Warm allocated WASM memory: ${(report.warmGrading.initialization.memoryBytes / 1048576).toFixed(2)} MiB.`, '');
  }
  const app = JSON.parse(await readFile(`docs/app-transfer-${browser}.json`, 'utf8'));
  lines.push(`Encoded app payload: board ${(app.boardBytes / 1000000).toFixed(3)} MB; first SQL screen total ${(app.totalBytes / 1000000).toFixed(3)} MB.`, '');
} else {
  lines.push('No current successful engine measurement is claimed.', '');
}

await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
