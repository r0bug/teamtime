import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// Use happy-dom for faster DOM testing
		environment: 'happy-dom',

		// Include patterns for test files
		include: [
			'tests/**/*.{test,spec}.{js,ts}',
			'src/**/*.{test,spec}.{js,ts}'
		],

		// Exclude patterns
		exclude: [
			'**/node_modules/**',
			'**/build/**',
			'tests/e2e/**', // E2E tests run with Playwright
			'tests/api/**', // API tests need integration testing approach
			'src/lib/server/logger.test.ts' // Manual integration test, not Vitest
		],

		// Global test setup
		setupFiles: ['tests/setup.ts'],

		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			reportsDirectory: './coverage',
			include: [
				'src/lib/**/*.ts'
			],
			exclude: [
				'**/*.d.ts',
				'**/*.test.ts',
				'**/*.spec.ts',
				'**/node_modules/**',
				'src/routes/**/*.ts' // Routes tested via integration/E2E
			]
		},

		// Test timeout
		testTimeout: 30000,

		// Hook timeout for async setup/teardown
		hookTimeout: 30000,

		// Enable globals (describe, it, expect)
		globals: true,

		// Resolve aliases matching SvelteKit
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
			'$app/environment': path.resolve(__dirname, './tests/mocks/app-environment.ts'),
			'$env/static/private': path.resolve(__dirname, './tests/mocks/env-private.ts')
		}
	}
});
