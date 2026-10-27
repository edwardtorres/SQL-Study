import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import { effectBlockBody } from './scripts/eslint-rules.mjs';
export default [
  { ignores: ['dist/**', 'node_modules/**', '.cache/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    plugins: { local: { rules: { 'effect-block-body': effectBlockBody } }, 'react-hooks': hooks },
    rules: { 'local/effect-block-body': 'error', 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
];
