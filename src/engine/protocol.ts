import type { GradeReport, QueryResult } from '../core/types';
export interface EngineInfo { initializationMs: number; memoryBytes: number }
export interface GradedSubmission { report: GradeReport; preview: QueryResult | null }
export interface WarmBenchmark { samplesMs: number[]; medianMs: number; maxMs: number; memoryBytes: number }
export type EngineRequest =
  | { type: 'init'; devSeed?: number }
  | { type: 'preview'; sql: string }
  | { type: 'grade'; challengeId: string; sql: string }
  | { type: 'schema'; table: string }
  | { type: 'benchmark'; challengeId: string };
export type EngineValue = EngineInfo | QueryResult | GradedSubmission | WarmBenchmark;
export interface WorkerRequest { id: number; request: EngineRequest }
export type WorkerResponse = { id: number; ok: true; value: EngineValue } | { id: number; ok: false; error: string; fatal: boolean };
