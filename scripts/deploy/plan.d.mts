// Declarations for plan.mjs, so the tests and the typechecker see its shapes. Keep this file in step with plan.mjs.
export interface PlanEntry {
  key: string;
  file: string;
  contentType: string;
  cacheControl: string;
  contentEncoding?: string;
}

export const CONTENT_TYPES: Record<string, string>;
export const IMMUTABLE: string;
export const REVALIDATE: string;
export const INVALIDATED: string[];
export function isHashed(key: string): boolean;
export function publishPlan(files: string[]): PlanEntry[];
export function prunable(bucketKeys: string[], plan: PlanEntry[]): string[];
