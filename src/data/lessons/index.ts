import type { Lesson } from '../../core/lesson';
import { lesson1 } from './ch1';
import { lesson2 } from './ch2';
import { lesson3 } from './ch3';
import { lesson4 } from './ch4';
import { lesson5 } from './ch5';
import { lesson6 } from './ch6';
import { lesson7 } from './ch7';

// Lesson text is loaded by the lesson view only; the grading worker never imports it.
export const lessons: readonly Lesson[] = [lesson1, lesson2, lesson3, lesson4, lesson5, lesson6, lesson7];
