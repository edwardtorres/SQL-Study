import type { QueryResult } from '../core/types';
import type { EngineInfo, EngineRequest, EngineValue, GradedSubmission, StatePreview, WarmBenchmark, WorkerResponse } from './protocol';

interface Pending { resolve: (value: EngineValue) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> }
export class EngineClient {
  private worker: Worker | undefined;
  private ready: Promise<EngineInfo> | undefined;
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private operations: Promise<void> = Promise.resolve();
  private reset(error: Error): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
    for (const pending of this.pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
  private spawn(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./game.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        if (pending.timer !== undefined) clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.ok) pending.resolve(message.value);
        else {
          pending.reject(new Error(message.error));
          if (message.fatal) this.reset(new Error('SQL workspace restarted after an engine error. Try again.'));
        }
      };
      this.worker.onerror = () => {
        this.reset(new Error('The SQL engine stopped. Try again to start a fresh workspace.'));
      };
      this.worker.onmessageerror = () => {
        this.reset(new Error('The SQL engine could not return its result. Try again.'));
      };
    }
    return this.worker;
  }
  private send(request: EngineRequest, timeoutMs: number): Promise<EngineValue> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const pending: Pending = { resolve, reject };
      this.pending.set(id, pending);
      try {
        this.spawn().postMessage({ id, request });
        // Count execution time only after dispatch, never while another query
        // or initialization is ahead of this request in the operation queue.
        if (this.pending.has(id)) {
          pending.timer = setTimeout(() => {
            this.reset(new Error('Query time limit reached. The worker was stopped; run again to restart safely.'));
          }, timeoutMs);
        }
      } catch (error) {
        this.reset(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  initialize(): Promise<EngineInfo> {
    if (!this.ready) {
      const attempt = (async () => {
        const request: EngineRequest = { type: 'init' };
        if (import.meta.env.DEV) {
          const { debugSeedOverride } = await import('../dev/hooks');
          const devSeed = debugSeedOverride();
          if (devSeed !== undefined) request.devSeed = devSeed;
        }
        // Initialization bypasses the query queue so a queued operation can
        // await it without waiting on itself.
        return await this.send(request, 30_000) as EngineInfo;
      })();
      this.ready = attempt;
      void attempt.catch(() => {
        // A failed worker may already have been replaced before this rejection
        // settles. Do not clear the replacement's initialization promise.
        if (this.ready === attempt) this.ready = undefined;
      });
    }
    return this.ready;
  }
  private operate<T extends EngineValue>(request: EngineRequest, timeoutMs: number): Promise<T> {
    const execute = async (): Promise<T> => {
      // Resolve readiness at dispatch time. A previous operation may have
      // timed out and terminated the worker while this request was queued.
      await this.initialize();
      return await this.send(request, timeoutMs) as T;
    };
    const operation = this.operations.then(execute, execute);
    this.operations = operation.then(() => undefined, () => undefined);
    return operation;
  }
  preview(sql: string): Promise<QueryResult> {
    return this.operate({ type: 'preview', sql }, 3500);
  }
  previewState(challengeId: string, sql: string): Promise<StatePreview> {
    return this.operate({ type: 'state', challengeId, sql }, 3500);
  }
  grade(challengeId: string, sql: string): Promise<GradedSubmission> {
    return this.operate({ type: 'grade', challengeId, sql }, 6000);
  }
  table(table: string): Promise<QueryResult> {
    return this.operate({ type: 'schema', table }, 3500);
  }
  benchmark(challengeId: string): Promise<WarmBenchmark> {
    return this.operate({ type: 'benchmark', challengeId }, 15_000);
  }
}
// Module is lazy-loaded with the SQL workspace; one worker survives ticket navigation.
export const sqlEngine = new EngineClient();
