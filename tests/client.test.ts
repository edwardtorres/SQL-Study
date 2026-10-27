import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EngineClient } from '../src/engine/client';
import type { EngineValue, WorkerRequest, WorkerResponse } from '../src/engine/protocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: WorkerRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: WorkerRequest): void { this.messages.push(message); }
  terminate(): void { this.terminated = true; }
  respond(index: number, value: EngineValue): void {
    const request = this.messages[index];
    if (!request) throw new Error('No dispatched request at this index.');
    this.onmessage?.({ data: { id: request.id, ok: true, value } } as MessageEvent<WorkerResponse>);
  }
  fail(index: number, error: string, fatal: boolean): void {
    const request = this.messages[index];
    if (!request) throw new Error('No dispatched request at this index.');
    this.onmessage?.({ data: { id: request.id, ok: false, error, fatal } } as MessageEvent<WorkerResponse>);
  }
}
const info = { initializationMs: 100, memoryBytes: 1_000_000 };
const rows = { fields: [{ name: 'id', dataTypeID: 23 }], rows: [[1]] };
const gradeResult = { preview: rows, report: { passed: true, outcomes: [], elapsedMs: 100 } };
async function settle(): Promise<void> {
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}
async function ready(client: EngineClient): Promise<FakeWorker> {
  const initialization = client.initialize();
  await settle();
  const worker = FakeWorker.instances.at(-1)!;
  expect(worker.messages[0]?.request.type).toBe('init');
  worker.respond(0, info);
  await initialization;
  return worker;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('window', { location: { search: '' } });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('warm worker client deadlines and recovery', () => {
  test('a queued schema request cannot prematurely time out an active grade', async () => {
    const client = new EngineClient();
    const worker = await ready(client);
    const grading = client.grade('dispatch', 'SELECT 1');
    const table = client.table('shipments');
    await settle();
    expect(worker.messages.map((message) => message.request.type)).toEqual(['init', 'grade']);
    await vi.advanceTimersByTimeAsync(4000);
    expect(worker.terminated).toBe(false);
    worker.respond(1, gradeResult);
    await expect(grading).resolves.toEqual(gradeResult);
    await settle();
    expect(worker.messages.map((message) => message.request.type)).toEqual(['init', 'grade', 'schema']);
    await vi.advanceTimersByTimeAsync(3000);
    expect(worker.terminated).toBe(false);
    worker.respond(2, rows);
    await expect(table).resolves.toEqual(rows);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  test('a queued request reinitializes after the preceding query times out', async () => {
    const client = new EngineClient();
    const first = await ready(client);
    const preview = client.preview('SELECT pg_sleep(10)');
    const failure = expect(preview).rejects.toThrow('time limit reached');
    const table = client.table('shipments');
    await settle();
    expect(first.messages.map((message) => message.request.type)).toEqual(['init', 'preview']);
    await vi.advanceTimersByTimeAsync(3500);
    await failure;
    await settle();
    expect(first.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    const replacement = FakeWorker.instances[1]!;
    expect(replacement.messages.map((message) => message.request.type)).toEqual(['init']);
    // Waiting for the new engine must not consume the queued query's deadline.
    await vi.advanceTimersByTimeAsync(4000);
    expect(replacement.terminated).toBe(false);
    replacement.respond(0, info);
    await settle();
    expect(replacement.messages.map((message) => message.request.type)).toEqual(['init', 'schema']);
    replacement.respond(1, rows);
    await expect(table).resolves.toEqual(rows);
  });

  test('ordinary SQL errors keep the warm worker and do not block the next operation', async () => {
    const client = new EngineClient();
    const worker = await ready(client);
    const invalid = client.preview('SELECT missing_column');
    const failure = expect(invalid).rejects.toThrow('does not exist');
    const next = client.preview('SELECT 1');
    await settle();
    worker.fail(1, 'column does not exist', false);
    await failure;
    await settle();
    expect(worker.messages.map((message) => message.request.type)).toEqual(['init', 'preview', 'preview']);
    worker.respond(2, rows);
    await expect(next).resolves.toEqual(rows);
    expect(worker.terminated).toBe(false);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  test('an older failed initialization cannot clear its replacement promise', async () => {
    const client = new EngineClient();
    const firstAttempt = client.initialize();
    const failure = expect(firstAttempt).rejects.toThrow('initialization failed');
    await settle();
    FakeWorker.instances[0]!.fail(0, 'initialization failed', true);
    // Start a new attempt before the old async rejection handlers settle.
    const replacementAttempt = client.initialize();
    await failure;
    await settle();
    expect(client.initialize()).toBe(replacementAttempt);
    const replacement = FakeWorker.instances[1]!;
    expect(replacement.messages.map((message) => message.request.type)).toEqual(['init']);
    replacement.respond(0, info);
    await expect(replacementAttempt).resolves.toEqual(info);
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
