/**
 * @module TestSetup
 * @description Global test setup for Vitest.
 *
 * This file runs before all tests and sets up:
 * - Timezone mocking (Pacific Time)
 * - Environment variables
 * - Global test utilities
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Mock timezone to Pacific for consistent date testing
beforeAll(() => {
	// Set timezone environment variable
	process.env.TZ = 'America/Los_Angeles';

	// Ensure test environment
	process.env.NODE_ENV = 'test';
});

afterEach(() => {
	// Clear all mocks after each test
	vi.clearAllMocks();
});

afterAll(() => {
	// Restore all mocks after all tests
	vi.restoreAllMocks();
});

// Global test utilities
declare global {
	/**
	 * Creates a mock date at a specific time in Pacific timezone
	 * @param dateString - ISO date string (e.g., "2024-01-15T09:00:00")
	 */
	function mockDate(dateString: string): void;

	/**
	 * Restores the real Date object
	 */
	function restoreDate(): void;
}

let realDate: DateConstructor;

globalThis.mockDate = (dateString: string) => {
	realDate = Date;
	const mockDate = new Date(dateString);
	vi.useFakeTimers();
	vi.setSystemTime(mockDate);
};

globalThis.restoreDate = () => {
	vi.useRealTimers();
};

// Export for type checking
export {};
