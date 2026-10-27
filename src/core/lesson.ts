import type { MistakeTag } from './types';

// A "predict, then run" moment. answerRows is the engine's row count for the section's example;
// the content check fails when it disagrees, so the prediction cannot be hand-written.
export interface PredictPrompt {
  question: string;
  options: readonly { id: string; text: string }[];
  answer: string;
  answerRows: number;
  explanation: string;
}

// A claim that PostgreSQL's documentation does not state verbatim. The engine's own output shows it instead.
// The content check runs every demonstration on the visible sample and fails if one errors.
export interface Demonstration {
  claim: string;
  sql: string;
}

export interface LessonSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  example: string;
  predict: PredictPrompt;
  commonMistakes: readonly { mistake: MistakeTag; text: string }[];
  // Ids into src/data/citations.json. Each id must resolve to a verbatim quote on the live page.
  citations: readonly string[];
  demonstrations?: readonly Demonstration[];
}

export interface Lesson {
  chapterId: number;
  sections: readonly LessonSection[];
}

export interface Citation {
  id: string;
  url: string;
  quote: string;
}
