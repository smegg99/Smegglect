// eslint.config.js
import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  {
    ignores: [
      'dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '**/generated/**', '.smegglect/**',
      'fixtures/**/node_modules/**', 'fixtures/**/.nuxt/**', 'fixtures/**/.output/**', 'fixtures/**/dist/**',
      'fixtures/**/dist-debug/**', 'fixtures/**/bin/**', 'fixtures/**/bindings/**', 'fixtures/pack/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
)
