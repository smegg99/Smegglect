// eslint.config.js
import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import ts from 'typescript-eslint'

/** 110 characters; a URL or an import path may run over. */
const LINE = { code: 110, ignoreUrls: true, ignorePattern: String.raw`^\s*(import|export)\s.*\sfrom\s'[^']+'$` }

export default ts.config(
  {
    ignores: [
      'dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '**/generated/**', '.smegglect/**',
      'fixtures/**/node_modules/**', 'fixtures/**/.nuxt/**', 'fixtures/**/.output/**', 'fixtures/**/dist/**',
      'fixtures/**/dist-debug/**', 'fixtures/**/bin/**', 'fixtures/**/bindings/**', 'fixtures/pack/**',
      'showcase/node_modules/**', 'showcase/.nuxt/**', 'showcase/.output/**', 'release/**',
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
  {
    // The source a person reads: short lines, small files and functions, a path comment on line one.
    files: ['src/**/*.ts', 'src/**/*.vue'],
    ignores: ['src/**/*.test.ts'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/max-len': ['error', LINE],
      'no-nested-ternary': 'error',
      'id-length': ['error', { min: 2, exceptions: ['i', 'j', 'x', 'y', 'a', 'b', 't'], properties: 'never' }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    // vue/max-len measures a component's template and script; the plain rule would count its lines twice.
    files: ['src/**/*.vue'],
    rules: {
      '@stylistic/max-len': 'off',
      'vue/max-len': ['error', { ...LINE, template: 110, ignoreHTMLAttributeValues: false }],
    },
  },
)
