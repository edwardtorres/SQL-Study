import { describe, expect, test } from 'vitest';
import { items } from '../src/data/catalog';
import { datasetCatalog, reviewSamples, seedSql } from '../src/data';
import { WarmEngine, type StateOptions } from '../src/engine/runtime';
import { sameRows } from '../src/grader/compare';
import { planProblemFor } from '../src/grader/plan';
import { readPolicy } from '../src/grader/policy';
import { sameState } from '../src/grader/state';

// A re-solve grades against a review sample. For every item and every review sample, the reference must pass its checks
// and constraint tests (write tickets), and at least one wrong variant must change the result. That keeps a learner's
// wrong answer visible on a fresh sample, as the visible sample does.
describe('review samples: every item on every pool seed', () => {
  test('the reference passes on each review sample, and at least one wrong variant changes the result there', async () => {
    const engine = await WarmEngine.create();
    try {
      for (const dataset of [...datasetCatalog, ...reviewSamples]) await engine.prepare(dataset, seedSql(dataset.seed, dataset.variant));
      const failures: string[] = [];
      for (const item of items) {
        for (const pool of reviewSamples) {
          let changed = false;
          if (item.checks) {
            const policy = item.policy ?? readPolicy;
            const options: StateOptions = {
              allow: policy.allow, transactions: policy.transactions ?? false, checks: item.checks, tests: item.constraintTests ?? [],
              ...(item.runs === 2 ? { runs: 2 as const } : {}),
            };
            const reference = await engine.runState(pool.id, item.referenceSql, options);
            if (reference.learnerError) failures.push(`${item.id} reference errors on ${pool.id}: ${reference.learnerError}`);
            for (const check of reference.checks) if (!check.result) failures.push(`${item.id} check ${check.id} errors on ${pool.id}`);
            for (const test of reference.tests) if (!test.passed) failures.push(`${item.id} reference fails "${test.name}" on ${pool.id}`);
            for (const variant of item.wrongVariants) {
              const wrong = await engine.runState(pool.id, variant.sql, options);
              if (!sameState(reference, wrong)) changed = true;
            }
          } else {
            const reference = await engine.run(pool.id, item.referenceSql);
            if (item.plan) {
              const referencePlan = planProblemFor(item.plan, await engine.planNodes(pool.id, item.referenceSql));
              if (referencePlan) failures.push(`${item.id} reference plan fails on ${pool.id}: ${referencePlan}`);
            }
            for (const variant of item.wrongVariants) {
              try {
                const wrong = await engine.run(pool.id, variant.sql);
                // A plan requirement counts too: a variant whose rows match but whose plan is wrong is caught by its plan.
                const planProblem = item.plan ? planProblemFor(item.plan, await engine.planNodes(pool.id, variant.sql)) : undefined;
                if (planProblem !== undefined || !sameRows(wrong, reference, item.ordered)) changed = true;
              } catch {
                // A variant that errors on this sample is visibly wrong too.
                changed = true;
              }
            }
          }
          if (!changed) failures.push(`${item.id} has no wrong variant that changes the result on ${pool.id}`);
        }
      }
      expect(failures).toEqual([]);
    } finally {
      await engine.close();
    }
  }, 900_000);
});
