import js from '@eslint/js';
import globals from 'globals';

// 只做正确性检查，不管排版：代码库刻意采用紧凑写法（着色器风格），不引入格式化器整仓重排
export default [
  { ignores: ['dist/', 'node_modules/', 'public/', '_koi_build/', '.claude/'] },   // .claude/worktrees 下是其他会话的整仓副本（含 dist）
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['_serve.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
];
