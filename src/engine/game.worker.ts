import { datasetCatalog, hiddenDatasets, reviewSampleFor, sampleDataset, schema, seedSql } from '../data';
import type { DatasetSpec } from '../core/types';
import { loadItem } from '../data/items/loader';
import { interviewItems } from '../data/interview';
import { planProblemFor } from '../grader/plan';
import { compareResults, sameRows, validateSql } from '../grader';
import type { Challenge, DatasetOutcome, GradeReport, MistakeFeedback, QueryResult } from '../core/types';
import { readPolicy } from '../grader/policy';
import { sameState, stateDiff } from '../grader/state';
import type { EngineInfo, EngineRequest, EngineValue, GradedSubmission, StatePreview, WorkerRequest, WorkerResponse } from './protocol';
import { WarmEngine, type StateOptions, type StateResult } from './runtime';

let initialization: Promise<WarmEngine> | undefined;
let info: EngineInfo;
let queue: Promise<void> = Promise.resolve();
let developmentSeed: number | undefined;
let hiddenLoaded: Promise<void> | undefined;
const safeError = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);
const fatalError = (error: unknown): boolean => {
  if (error instanceof WebAssembly.RuntimeError) return true;
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    if (/^[0-9A-Z]{5}$/.test(error.code)) return error.code === '53200';
    if (error.code === 'ENOMEM') return true;
  }
  return /out of memory|memory access out of bounds|memory allocation failed|cannot enlarge memory/i.test(safeError(error));
};
const seedFor = (dataset: DatasetSpec): number => (developmentSeed === undefined ? dataset.seed : developmentSeed + datasetCatalog.indexOf(dataset));
// Startup seeds only the visible sample; that is all the editor needs to run a query.
function engine(): Promise<WarmEngine> {
  if (!initialization) {
    initialization = (async () => {
      const start = performance.now();
      const runtime = await WarmEngine.create();
      const seed = seedFor(sampleDataset);
      await runtime.prepare({ ...sampleDataset, seed }, seedSql(seed, sampleDataset.variant));
      info = { initializationMs: performance.now() - start, memoryBytes: runtime.memoryBytes() };
      return runtime;
    })();
  }
  return initialization;
}
// Hidden datasets are seeded one at a time on the engine's queue, so a learner's preview waits for at most one of them.
// A Submit awaits this promise. A failed load clears it so the next Submit retries.
function loadHidden(runtime: WarmEngine): Promise<void> {
  hiddenLoaded ??= (async () => {
    for (const dataset of hiddenDatasets) {
      const seed = seedFor(dataset);
      await runtime.prepare({ ...dataset, seed }, seedSql(seed, dataset.variant));
    }
  })().catch((error: unknown) => {
    hiddenLoaded = undefined;
    throw error;
  });
  return hiddenLoaded;
}

// Ticket definitions load per chapter: a request names its ticket, and the worker loads only that chapter.
async function challengeOf(id: string): Promise<Challenge> {
  // The interview reserve is not in any chapter, so it is looked up first.
  const reserved = interviewItems.find((item) => item.id === id);
  if (reserved) return reserved;
  try { return await loadItem(id); }
  catch { throw new Error('Unknown ticket.'); }
}

// The visible sample, or the review sample a re-solve names. Each review sample loads on first use, so the warm start does not pay for it.
async function sampleOf(runtime: WarmEngine, reviewSeed: string | undefined): Promise<DatasetSpec> {
  if (reviewSeed === undefined) return sampleDataset;
  const pool = reviewSampleFor(reviewSeed);
  if (!pool) throw new Error('Unknown review sample.');
  const spec = { ...pool, seed: seedFor(pool) };
  await runtime.prepare(spec, seedSql(spec.seed, spec.variant));
  return spec;
}

// A re-solve grades against a review sample in place of the visible sample. The other datasets are unchanged.
async function gradeDatasets(runtime: WarmEngine, challenge: Challenge, reviewSeed: string | undefined): Promise<readonly DatasetSpec[]> {
  if (reviewSeed === undefined) return challenge.datasets;
  const sample = await sampleOf(runtime, reviewSeed);
  return challenge.datasets.map((dataset) => (dataset.id === sampleDataset.id ? sample : dataset));
}


async function grade(challengeId: string, sql: string, reviewSeed?: string): Promise<GradedSubmission> {
  const runtime = await engine();
  const challenge = await challengeOf(challengeId);
  const start = performance.now();
  // A Submit waits for the hidden datasets (background-loaded after the editor is ready) on every grading path.
  await loadHidden(runtime);
  const datasets = await gradeDatasets(runtime, challenge, reviewSeed);
  if (challenge.checks) return gradeState(runtime, challenge, datasets, sql, start);
  const outcomes: DatasetOutcome[] = [];
  const actualResults = new Map<string, QueryResult>();
  let preview: QueryResult | null = null;
  try {
    await validateSql(sql, challenge.structure ? { mode: 'read', structure: challenge.structure } : { mode: 'read' });
  } catch (error) {
    return { preview, report: { passed: false, outcomes, elapsedMs: performance.now() - start, error: safeError(error) } };
  }
  for (const dataset of datasets) {
    try {
      const actual = await runtime.run(dataset.id, sql);
      actualResults.set(dataset.id, actual);
      if (!dataset.hidden) preview = actual;
      const expected = await runtime.run(dataset.id, challenge.referenceSql);
      const rowDiff = compareResults(actual, expected, { ordered: challenge.ordered, columns: challenge.columns });
      // A plan requirement is checked on the same dataset, from the planner's choice for the learner's SELECT.
      const planProblem = challenge.plan ? planProblemFor(challenge.plan, await runtime.planNodes(dataset.id, sql)) : undefined;
      const diff = planProblem === undefined ? rowDiff : { passed: false, message: planProblem, missing: [], extra: [] };
      outcomes.push({ id: dataset.id, label: dataset.label, hidden: dataset.hidden, passed: diff.passed, diff });
    } catch (error) {
      if (fatalError(error)) throw error;
      outcomes.push({ id: dataset.id, label: dataset.label, hidden: dataset.hidden, passed: false, diff: { passed: false, message: safeError(error), missing: [], extra: [] } });
    }
  }
  const passed = outcomes.every((outcome) => outcome.passed);
  const report: GradeReport = { passed, outcomes, elapsedMs: performance.now() - start };
  if (!passed) {
    const mistake = await matchMistake(runtime, challenge, datasets, actualResults);
    if (mistake) report.mistake = mistake;
  }
  return { report, preview };
}

// Write tickets: learner statements, then trusted checks and constraint tests, inside one rolled-back transaction per dataset.
// A write ticket's sample view: the learner's statements, then the same checks and constraint tests a submission uses.
async function statePreview(runtime: WarmEngine, challengeId: string, sql: string, reviewSeed: string | undefined): Promise<StatePreview> {
  const challenge = await loadItem(challengeId).catch(() => undefined);
  if (!challenge?.checks) throw new Error('This ticket is graded by its query result, not by database state.');
  const policy = challenge.policy ?? readPolicy;
  const sample = await sampleOf(runtime, reviewSeed);
  return runtime.runState(sample.id, sql, {
    allow: policy.allow, transactions: policy.transactions ?? false, checks: challenge.checks, tests: challenge.constraintTests ?? [], ...(challenge.runs === 2 ? { runs: 2 as const } : {}),
  });
}

async function gradeState(runtime: WarmEngine, challenge: Challenge, datasets: readonly DatasetSpec[], sql: string, start: number): Promise<GradedSubmission> {
  const policy = challenge.policy ?? readPolicy;
  const options: StateOptions = { allow: policy.allow, transactions: policy.transactions ?? false, checks: challenge.checks ?? [], tests: challenge.constraintTests ?? [], ...(challenge.runs === 2 ? { runs: 2 as const } : {}) };
  const outcomes: DatasetOutcome[] = [];
  const actualStates = new Map<string, StateResult>();
  let preview: QueryResult | null = null;
  try {
    await validateSql(sql, { mode: 'write', allow: policy.allow, transactions: options.transactions ?? false });
  } catch (error) {
    return { preview, report: { passed: false, outcomes, elapsedMs: performance.now() - start, error: safeError(error) } };
  }
  for (const dataset of datasets) {
    try {
      const actual = await runtime.runState(dataset.id, sql, options);
      actualStates.set(dataset.id, actual);
      if (!dataset.hidden) preview = actual.checks[0]?.result ?? null;
      const expected = await runtime.runState(dataset.id, challenge.referenceSql, options);
      const diff = stateDiff(actual, expected);
      outcomes.push({ id: dataset.id, label: dataset.label, hidden: dataset.hidden, passed: diff.passed, diff });
    } catch (error) {
      if (fatalError(error)) throw error;
      outcomes.push({ id: dataset.id, label: dataset.label, hidden: dataset.hidden, passed: false, diff: { passed: false, message: safeError(error), missing: [], extra: [] } });
    }
  }
  const passed = outcomes.every((outcome) => outcome.passed);
  const report: GradeReport = { passed, outcomes, elapsedMs: performance.now() - start };
  if (!passed) {
    const mistake = await matchStateMistake(runtime, challenge, datasets, options, actualStates);
    if (mistake) report.mistake = mistake;
  }
  return { report, preview };
}

// A wrong variant that leaves exactly the learner's state, on every dataset, gets that mistake's explanation.
async function matchStateMistake(runtime: WarmEngine, challenge: Challenge, datasets: readonly DatasetSpec[], options: StateOptions, actual: ReadonlyMap<string, StateResult>): Promise<MistakeFeedback | undefined> {
  if (actual.size !== datasets.length) return undefined;
  for (const variant of challenge.wrongVariants) {
    let matches = true;
    for (const dataset of datasets) {
      try {
        const wrong = await runtime.runState(dataset.id, variant.sql, options);
        if (!sameState(actual.get(dataset.id)!, wrong)) { matches = false; break; }
      } catch (error) {
        if (fatalError(error)) throw error;
        matches = false;
        break;
      }
    }
    if (matches) return { id: variant.id, mistake: variant.mistake, explanation: variant.explanation };
  }
  return undefined;
}

// A failing submission that returns exactly a known wrong variant's rows on every dataset gets that
// mistake's targeted explanation. Any error while running a variant means it does not match.
async function matchMistake(runtime: WarmEngine, challenge: Challenge, datasets: readonly DatasetSpec[], actual: ReadonlyMap<string, QueryResult>): Promise<MistakeFeedback | undefined> {
  if (actual.size !== datasets.length) return undefined;
  for (const variant of challenge.wrongVariants) {
    let matches = true;
    for (const dataset of datasets) {
      try {
        const wrong = await runtime.run(dataset.id, variant.sql);
        if (!sameRows(actual.get(dataset.id)!, wrong, challenge.ordered)) { matches = false; break; }
      } catch (error) {
        if (fatalError(error)) throw error;
        matches = false;
        break;
      }
    }
    if (matches) return { id: variant.id, mistake: variant.mistake, explanation: variant.explanation };
  }
  return undefined;
}
async function handle(request: EngineRequest): Promise<EngineValue> {
  if (request.type === 'init') {
    if (import.meta.env.DEV && 'devSeed' in request) developmentSeed = request.devSeed;
    const runtime = await engine();
    // Start the hidden datasets after the editor can run; a failure here is retried on the next Submit.
    void loadHidden(runtime).catch(() => undefined);
    return info;
  }
  const runtime = await engine();
  if (request.type === 'preview') return runtime.run((await sampleOf(runtime, request.reviewSeed)).id, request.sql);
  if (request.type === 'demonstrate') return runtime.demonstratePlan('sample', request.sql);
  if (request.type === 'state') return statePreview(runtime, request.challengeId, request.sql, request.reviewSeed);
  if (request.type === 'schema') {
    if (!schema.some((table) => table.name === request.table)) throw new Error('Unknown table.');
    return runtime.run('sample', `SELECT * FROM "${request.table}" ORDER BY 1 LIMIT 5;`);
  }
  if (request.type === 'grade') return grade(request.challengeId, request.sql, request.reviewSeed);
  const challenge = await challengeOf(request.challengeId);
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
