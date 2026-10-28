// Words and phrases that state a rule in a ticket's instructions: a NULL or missing value, a zero count, a tie, a boundary,
// a repeat, a cohort month, a second run. An item whose instructions use one must declare the rule in its rules list.
// The list is deliberately broad. A false alarm costs one declaration; a missed rule costs a learner a wrong answer that passes.
const RULE_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['NULL', /\bnull/i],
  ['missing', /\bmissing\b/i],
  ['no', /\bno\b/i],
  ['none', /\bnone\b/i],
  ['left out', /\bleft out\b/i],
  ['zero', /\bzero\b/i],
  ['tie', /\bties?\b|\btied\b/i],
  ['equal', /\bequal\b/i],
  ['once', /\bonce\b/i],
  ['twice', /\btwice\b/i],
  ['repeat', /\brepeat/i],
  ['at least', /\bat least\b/i],
  ['at most', /\bat most\b/i],
  ['exactly', /\bexactly\b/i],
  ['first', /\bfirst\b/i],
  ['next', /\bnext\b/i],
  ['previous', /\bprevious\b/i],
  ['latest', /\blatest\b/i],
  ['earliest', /\bearliest\b/i],
  ['newest', /\bnewest\b/i],
  ['boundary', /\bboundary\b/i],
  ['distinct', /\bdistinct\b/i],
  ['second run', /\bsecond run\b/i],
];

/** The rule words an instruction text uses. Empty when the text states no rule. */
export function statedRuleWords(instructions: string): string[] {
  return RULE_PATTERNS.filter(([, pattern]) => pattern.test(instructions)).map(([word]) => word);
}
