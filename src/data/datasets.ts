import type { DatasetSpec } from '../core/types';

// One visible dataset and a catalog of hidden edge-case datasets. Items name the subset they use.
export const sampleDataset: DatasetSpec = { id: 'sample', label: 'Visible sample', hidden: false, seed: 104729, variant: 'sample' };

export const hiddenDatasets: readonly DatasetSpec[] = [
  { id: 'nulls', label: 'Edge case A', hidden: true, seed: 130363, variant: 'nulls' },
  { id: 'ties', label: 'Edge case B', hidden: true, seed: 155921, variant: 'ties' },
  { id: 'boundary', label: 'Edge case C', hidden: true, seed: 181081, variant: 'boundary' },
  { id: 'empty', label: 'Edge case D', hidden: true, seed: 196613, variant: 'empty' },
  { id: 'nulltext', label: 'Edge case E', hidden: true, seed: 214747, variant: 'nulltext' },
  { id: 'precision', label: 'Edge case F', hidden: true, seed: 231917, variant: 'precision' },
];

export const datasetCatalog: readonly DatasetSpec[] = [sampleDataset, ...hiddenDatasets];

/** Visible sample first, then the requested hidden datasets in catalog order. */
export function datasetsFor(hiddenIds: readonly string[]): readonly DatasetSpec[] {
  const selected = hiddenDatasets.filter((dataset) => hiddenIds.includes(dataset.id));
  if (selected.length !== hiddenIds.length) throw new Error(`Unknown hidden dataset in: ${hiddenIds.join(', ')}`);
  return [sampleDataset, ...selected];
}

// Review samples stand in for the visible sample on a re-solve, so a learner cannot rely on remembered output. They are
// not in datasetCatalog: the warm start never builds them. Every item is checked against each one by tests/review-pool.test.ts.
export const reviewSamples: readonly DatasetSpec[] = [
  { id: 'pool_a', label: 'Review sample A', hidden: false, seed: 271441, variant: 'sample' },
  { id: 'pool_b', label: 'Review sample B', hidden: false, seed: 318593, variant: 'sample' },
  { id: 'pool_c', label: 'Review sample C', hidden: false, seed: 402731, variant: 'sample' },
  { id: 'pool_d', label: 'Review sample D', hidden: false, seed: 473019, variant: 'sample' },
];

export function reviewSampleFor(id: string): DatasetSpec | undefined {
  return reviewSamples.find((dataset) => dataset.id === id);
}

// The review sample for a re-solve: the four samples rotate by attempt, so the same ticket is not seen twice in a row.
export function reviewSampleIdFor(attempts: number): string {
  return reviewSamples[attempts % reviewSamples.length]!.id;
}
