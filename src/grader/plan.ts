import type { PlanCheck } from '../core/types';

// Every node type in an EXPLAIN (FORMAT JSON) plan, in plan order: Seq Scan, Index Scan, Bitmap Index Scan and so on.
export function nodeTypes(plan: unknown): string[] {
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record['Node Type'] === 'string') found.push(record['Node Type']);
    for (const child of Object.values(record)) visit(child);
  };
  visit(plan);
  return found;
}

// The plan requirement's problem for a learner's plan, or undefined when the plan meets it.
export function planProblemFor(plan: PlanCheck, nodes: readonly string[]): string | undefined {
  const missing = plan.mustContain.filter((node) => !nodes.includes(node));
  if (missing.length > 0) return `The planner uses ${nodes.join(', ') || 'no scan'} for this query; this ticket needs ${missing.join(' and ')}.`;
  const forbidden = (plan.mustNotContain ?? []).filter((node) => nodes.includes(node));
  if (forbidden.length > 0) return `The planner uses ${forbidden.join(' and ')} for this query; this ticket needs a different access path.`;
  return undefined;
}
