import type { GradeReport, QueryResult } from '../core/types';
import type { StateResult } from './runtime';
export interface EngineInfo { initializationMs: number; memoryBytes: number }
export interface GradedSubmission { report: GradeReport; preview: QueryResult | null }
// What a learner sees for a write ticket: the trusted checks and constraint tests after their statements, or the learner's error.
export type StatePreview = StateResult;
export interface WarmBenchmark { samplesMs: number[]; medianMs: number; maxMs: number; memoryBytes: number }
export type EngineRequest =
  | { type: 'init'; devSeed?: number }
  | { type: 'preview'; sql: string }
  | { type: 'demonstrate'; sql: string }
  | { type: 'state'; challengeId: string; sql: string }
  | { type: 'grade'; challengeId: string; sql: string }
  | { type: 'schema'; table: string }
  | { type: 'benchmark'; challengeId: string };
export type EngineValue = EngineInfo | QueryResult | GradedSubmission | WarmBenchmark | StatePreview;
export interface WorkerRequest { id: number; request: EngineRequest }
export type WorkerResponse = { id: number; ok: true; value: EngineValue } | { id: number; ok: false; error: string; fatal: boolean };
