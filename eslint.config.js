import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			// Disable TypeScript rules that don't work well with Svelte
			'@typescript-eslint/no-unused-vars': 'off',
			'no-undef': 'off' // Svelte handles this
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'dist/',
			'node_modules/',
			'drizzle/',
			'coverage/',
			'playwright-report/',
			'test-results/'
		]
	},
	{
		files: ['**/*.ts', '**/*.js'],
		rules: {
			// TypeScript specific rules
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off', // We use these deliberately after auth checks

			// General code quality
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-debugger': 'error',
			'no-duplicate-imports': 'error',
			'no-template-curly-in-string': 'warn',
			'prefer-const': 'warn',
			'no-var': 'error',
			eqeqeq: ['error', 'always', { null: 'ignore' }],

			// Security-focused rules
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
			'no-script-url': 'error'
		}
	},
	{
		files: ['**/*.svelte'],
		rules: {
			// Svelte specific
			'svelte/no-at-html-tags': 'warn', // Warn about potential XSS via @html
			'svelte/valid-compile': 'error'
		}
	}
];
