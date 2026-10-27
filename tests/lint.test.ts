import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';
// @ts-expect-error Local JavaScript lint rule intentionally has no declaration file.
import { effectBlockBody } from '../scripts/eslint-rules.mjs';
const lint = (source: string) => new Linter().verify(source, [{
  files: ['**/*.tsx'], languageOptions: { parser: tseslint.parser },
  plugins: { local: { rules: { block: effectBlockBody } } }, rules: { 'local/block': 'error' },
}], { filename: 'probe.tsx' });
test('React effects require block bodies including aliased imports and members', () => {
  expect(lint('import {useEffect} from "react";useEffect(()=>window.scrollTo(0,0));')).toHaveLength(1);
  expect(lint('import {useEffect as effect} from "react";effect(()=>window.scrollTo(0,0));')).toHaveLength(1);
  expect(lint('React.useEffect(()=>window.scrollTo(0,0));')).toHaveLength(1);
  expect(lint('import {useEffect} from "react";useEffect(()=>{window.scrollTo(0,0);});')).toHaveLength(0);
});
