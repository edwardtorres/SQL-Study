import { challenges, datasets, schema, seedSql } from '../data';
import { compareResults, validateSql } from '../grader';
import type { DatasetOutcome, GradeReport, QueryResult } from '../core/types';
import type { EngineInfo, EngineRequest, EngineValue, GradedSubmission, WorkerRequest, WorkerResponse } from './protocol';
import { WarmEngine } from './runtime';

let initialization: Promise<WarmEngine> | undefined;
let info: EngineInfo;
let queue: Promise<void> = Promise.resolve();
let developmentSeed: number | undefined;
const safeError = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);
const fatalError = (error: unknown): boolean => {
  if (error instanceof WebAssembly.RuntimeError) return true;
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    if (/^[0-9A-Z]{5}$/.test(error.code)) return error.code === '53200';
    if (error.code === 'ENOMEM') return true;
  }
  return /out of memory|memory access out of bounds|memory allocation failed|cannot enlarge memory/i.test(safeError(error));
};
function engine(): Promise<WarmEngine> {
  if (!initialization) {
    initialization = (async () => {
      const start = performance.now();
      const runtime = await WarmEngine.create();
      for (const dataset of datasets) {
        const seed = developmentSeed === undefined ? dataset.seed : developmentSeed + datasets.indexOf(dataset);
        await runtime.prepare({ ...dataset, seed }, seedSql(seed, dataset.variant));
      }
      info = { initializationMs: performance.now() - start, memoryBytes: runtime.memoryBytes() };
      return runtime;
    })();
  }
  return initialization;
}
async function grade(challengeId: string, sql: string): Promise<GradedSubmission> {
  const runtime = await engine();
  const challenge = challenges.find((item) => item.id === challengeId);
  if (!challenge) throw new Error('Unknown ticket.');
  const start = performance.now();
  const outcomes: DatasetOutcome[] = [];
  let preview: QueryResult | null = null;
  try {
    await validateSql(sql, challenge.structure ? { mode: 'read', structure: challenge.structure } : { mode: 'read' });
  } catch (error) {
    return { preview, report: { passed: false, outcomes, elapsedMs: performance.now() - start, error: safeError(error) } };
  }
  for (const dataset of challenge.datasets) {
    try {
      const actual = await runtime.run(dataset.id, sql);
      if (!dataset.hidden) preview = actual;
      const expected = await runtime.run(dataset.id, challenge.referenceSql);
      const diff = compareResults(actual, expected, { ordered: challenge.ordered, columns: challenge.columns });
      outcomes.push({ id: dataset.id, label: dataset.label, hidden: dataset.hidden, passed: diff.passed, diff });
    } catch (error) {
      if (fatalError(error)) throw error;
      outcomes.push({ id: dataset.id, label: dataset.label, hidden: dataset.hidden, passed: false, diff: { passed: false, message: safeError(error), missing: [], extra: [] } });
    }
  }
  const report: GradeReport = { passed: outcomes.every((outcome) => outcome.passed), outcomes, elapsedMs: performance.now() - start };
  return { report, preview };
}
async function handle(request: EngineRequest): Promise<EngineValue> {
  if (request.type === 'init') {
    if (import.meta.env.DEV && 'devSeed' in request) developmentSeed = request.devSeed;
    await engine();
    return info;
  }
  const runtime = await engine();
  if (request.type === 'preview') return runtime.run('sample', request.sql);
  if (request.type === 'schema') {
    if (!schema.some((table) => table.name === request.table)) throw new Error('Unknown table.');
    return runtime.run('sample', `SELECT * FROM "${request.table}" ORDER BY 1 LIMIT 5;`);
  }
  if (request.type === 'grade') return grade(request.challengeId, request.sql);
  const challenge = challenges.find((item) => item.id === request.challengeId);
  if (!challenge) throw new Error('Unknown ticket.');
  await grade(challenge.id, challenge.referenceSql);
  const samplesMs: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const result = await grade(challenge.id, challenge.referenceSql);
    if (!result.report.passed) throw new Error('Reference failed its benchmark datasets.');
    samplesMs.push(result.report.elapsedMs);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return { samplesMs, medianMs: sorted[Math.floor(sorted.length / 2)]!, maxMs: Math.max(...samplesMs), memoryBytes: runtime.memoryBytes() };
}
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  queue = queue.then(async () => {
    let response: WorkerResponse;
    try {
      response = { id, ok: true, value: await handle(request) };
    } catch (error) {
      const message = safeError(error);
      response = { id, ok: false, error: message, fatal: fatalError(error) || !info };
    }
    self.postMessage(response);
  });
};
