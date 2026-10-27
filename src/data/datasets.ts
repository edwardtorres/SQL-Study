import type { DatasetSpec } from '../core/types';

// One visible dataset and a catalog of hidden edge-case datasets. Items name the subset they use.
export const sampleDataset: DatasetSpec = { id: 'sample', label: 'Visible sample', hidden: false, seed: 104729, variant: 'sample' };

export const hiddenDatasets: readonly DatasetSpec[] = [
  { id: 'nulls', label: 'Edge case A', hidden: true, seed: 130363, variant: 'nulls' },
  { id: 'ties', label: 'Edge case B', hidden: true, seed: 155921, variant: 'ties' },
  { id: 'boundary', label: 'Edge case C', hidden: true, seed: 181081, variant: 'boundary' },
  { id: 'empty', label: 'Edge case D', hidden: true, seed: 196613, variant: 'empty' },
  { id: 'nulltext', label: 'Edge case E', hidden: true, seed: 214747, variant: 'nulltext' },
];

export const datasetCatalog: readonly DatasetSpec[] = [sampleDataset, ...hiddenDatasets];

/** Visible sample first, then the requested hidden datasets in catalog order. */
export function datasetsFor(hiddenIds: readonly string[]): readonly DatasetSpec[] {
  const selected = hiddenDatasets.filter((dataset) => hiddenIds.includes(dataset.id));
  if (selected.length !== hiddenIds.length) throw new Error(`Unknown hidden dataset in: ${hiddenIds.join(', ')}`);
  return [sampleDataset, ...selected];
}
