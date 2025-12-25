import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Runs end-to-end tests against the TeamTime application.
 * Tests are located in tests/e2e/ directory.
 */
export default defineConfig({
	// Directory containing E2E test files
	testDir: './tests/e2e',

	// Maximum time one test can run
	timeout: 30 * 1000,

	// Maximum time expect() should wait for conditions
	expect: {
		timeout: 5000
	},

	// Run tests in parallel
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 2 : 0,

	// Opt out of parallel tests on CI
	workers: process.env.CI ? 1 : undefined,

	// Reporter to use
	reporter: [
		['html', { outputFolder: 'playwright-report' }],
		['list']
	],

	// Shared settings for all projects
	use: {
		// Base URL for the application
		baseURL: 'http://localhost:5173',

		// Collect trace when retrying the failed test
		trace: 'on-first-retry',

		// Screenshot on failure
		screenshot: 'only-on-failure',

		// Video on failure
		video: 'on-first-retry'
	},

	// Configure projects for major browsers
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		// Uncomment to add more browsers
		// {
		// 	name: 'firefox',
		// 	use: { ...devices['Desktop Firefox'] }
		// },
		// {
		// 	name: 'mobile-chrome',
		// 	use: { ...devices['Pixel 5'] }
		// }
	],

	// Run local dev server before starting the tests
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120 * 1000
	}
});
