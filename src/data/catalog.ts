import type { Challenge } from '../core/types';
import { challenges as stepOneSamples } from './challenges';
import { chapter1Items } from './items/ch1';
import { chapter2Items } from './items/ch2';
import { chapter3Items } from './items/ch3';
import { chapter4Items } from './items/ch4';
import { chapter5Items } from './items/ch5';
import { chapter6Items } from './items/ch6';

// Every graded item the engine can grade. The worker imports this module; lessons stay out of it.
export const items: readonly Challenge[] = [...stepOneSamples, ...chapter1Items, ...chapter2Items, ...chapter3Items, ...chapter4Items, ...chapter5Items, ...chapter6Items];

export function itemById(id: string): Challenge | undefined {
  return items.find((item) => item.id === id);
}
