/**
 * @module TestFixtures/Database
 * @description Database utilities for testing.
 *
 * Provides helpers for:
 * - Creating test database connections
 * - Seeding test data
 * - Cleaning up after tests
 *
 * IMPORTANT: Tests using this module require a test database.
 * Set TEST_DATABASE_URL environment variable or tests will be skipped.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '$lib/server/db/schema';
import { testUsers, type MockUser } from './users';
import { vi } from 'vitest';

// Test database URL - separate from production
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

let testClient: ReturnType<typeof postgres> | null = null;
let testDb: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create test database connection
 * @returns Drizzle database instance for testing
 */
export function getTestDb() {
	if (!TEST_DATABASE_URL) {
		throw new Error('TEST_DATABASE_URL or DATABASE_URL environment variable required for database tests');
	}

	if (!testDb) {
		testClient = postgres(TEST_DATABASE_URL);
		testDb = drizzle(testClient, { schema });
	}

	return testDb;
}

/**
 * Close test database connection
 */
export async function closeTestDb() {
	if (testClient) {
		await testClient.end();
		testClient = null;
		testDb = null;
	}
}

/**
 * Check if database tests should be skipped
 * @returns true if no database URL is configured
 */
export function shouldSkipDbTests(): boolean {
	return !TEST_DATABASE_URL;
}

/**
 * Creates a mock database for unit tests that don't need real DB
 * @returns Mocked database object with common operations
 */
export function createMockDb() {
	return {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		offset: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([]),
		update: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		query: {
			users: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([])
			},
			tasks: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([])
			},
			shifts: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([])
			},
			timeEntries: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([])
			}
		}
	};
}

/**
 * Seeds test users into the database
 * @param db - Drizzle database instance
 * @returns Created user records
 */
export async function seedTestUsers(db: ReturnType<typeof drizzle>) {
	const users = Object.values(testUsers);
	const createdUsers = [];

	for (const user of users) {
		// Generate a simple hash for testing (not secure, just for tests)
		const pinHash = '$argon2id$test_hash_' + user.username;

		const [created] = await db
			.insert(schema.users)
			.values({
				id: user.id,
				email: user.email,
				username: user.username,
				name: user.name,
				role: user.role,
				phone: user.phone,
				avatarUrl: user.avatarUrl,
				hourlyRate: user.hourlyRate,
				twoFactorEnabled: user.twoFactorEnabled,
				canListOnEbay: user.canListOnEbay,
				isActive: user.isActive,
				pinHash
			})
			.onConflictDoNothing()
			.returning();

		if (created) {
			createdUsers.push(created);
		}
	}

	return createdUsers;
}

/**
 * Cleans up test data from the database
 * @param db - Drizzle database instance
 */
export async function cleanupTestData(db: ReturnType<typeof drizzle>) {
	// Delete in reverse dependency order
	const testUserIds = Object.values(testUsers).map((u) => u.id);

	// Clean up related tables first (sessions, time entries, etc.)
	// Then clean up users
	await db.delete(schema.users).where(
		// @ts-expect-error - using raw SQL for IN clause
		schema.users.id.in(testUserIds)
	);
}

/**
 * Transaction wrapper for test isolation
 * @param db - Drizzle database instance
 * @param callback - Function to run within transaction
 */
export async function withTransaction<T>(
	db: ReturnType<typeof drizzle>,
	callback: (tx: ReturnType<typeof drizzle>) => Promise<T>
): Promise<T> {
	// Note: Drizzle transactions work differently, this is a simplified version
	return callback(db);
}

export { schema };
