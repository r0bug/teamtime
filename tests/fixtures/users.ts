/**
 * @module TestFixtures/Users
 * @description Mock user data for testing.
 *
 * Provides user objects for all role types (admin, manager, purchaser, staff)
 * with realistic data for comprehensive test coverage.
 */

import { v4 as uuidv4 } from 'uuid';

export type UserRole = 'admin' | 'manager' | 'purchaser' | 'staff';

export interface MockUser {
	id: string;
	email: string;
	username: string;
	name: string;
	role: UserRole;
	phone: string | null;
	avatarUrl: string | null;
	hourlyRate: string | null;
	twoFactorEnabled: boolean;
	canListOnEbay: boolean;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Creates a mock user with sensible defaults
 * @param overrides - Properties to override
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
	const now = new Date();
	return {
		id: uuidv4(),
		email: `test-${Date.now()}@example.com`,
		username: `testuser${Date.now()}`,
		name: 'Test User',
		role: 'staff',
		phone: null,
		avatarUrl: null,
		hourlyRate: '15.00',
		twoFactorEnabled: true,
		canListOnEbay: false,
		isActive: true,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

// Pre-defined test users for each role
export const testUsers = {
	admin: createMockUser({
		id: '00000000-0000-0000-0000-000000000001',
		email: 'admin@teamtime.test',
		username: 'admin_test',
		name: 'Test Admin',
		role: 'admin',
		hourlyRate: '50.00',
		canListOnEbay: true
	}),

	manager: createMockUser({
		id: '00000000-0000-0000-0000-000000000002',
		email: 'manager@teamtime.test',
		username: 'manager_test',
		name: 'Test Manager',
		role: 'manager',
		hourlyRate: '35.00',
		canListOnEbay: true
	}),

	purchaser: createMockUser({
		id: '00000000-0000-0000-0000-000000000003',
		email: 'purchaser@teamtime.test',
		username: 'purchaser_test',
		name: 'Test Purchaser',
		role: 'purchaser',
		hourlyRate: '20.00',
		canListOnEbay: true
	}),

	staff: createMockUser({
		id: '00000000-0000-0000-0000-000000000004',
		email: 'staff@teamtime.test',
		username: 'staff_test',
		name: 'Test Staff',
		role: 'staff',
		hourlyRate: '15.00',
		canListOnEbay: false
	}),

	inactiveStaff: createMockUser({
		id: '00000000-0000-0000-0000-000000000005',
		email: 'inactive@teamtime.test',
		username: 'inactive_test',
		name: 'Inactive Staff',
		role: 'staff',
		isActive: false
	})
};

/**
 * Get user by role for testing
 * @param role - The user role to retrieve
 */
export function getUserByRole(role: UserRole): MockUser {
	switch (role) {
		case 'admin':
			return testUsers.admin;
		case 'manager':
			return testUsers.manager;
		case 'purchaser':
			return testUsers.purchaser;
		case 'staff':
		default:
			return testUsers.staff;
	}
}

/**
 * Get all test users as an array
 */
export function getAllTestUsers(): MockUser[] {
	return Object.values(testUsers);
}

/**
 * Get active test users only
 */
export function getActiveTestUsers(): MockUser[] {
	return getAllTestUsers().filter((user) => user.isActive);
}
