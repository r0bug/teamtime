/**
 * @module TestFixtures
 * @description Central export for all test fixtures.
 *
 * Import all fixtures from this module:
 * @example
 * import { testUsers, createMockDb, callHandlerAs } from '../fixtures';
 */

// User fixtures
export {
	createMockUser,
	testUsers,
	getUserByRole,
	getAllTestUsers,
	getActiveTestUsers,
	type MockUser,
	type UserRole
} from './users';

// Database fixtures
export {
	getTestDb,
	closeTestDb,
	shouldSkipDbTests,
	createMockDb,
	seedTestUsers,
	cleanupTestData,
	withTransaction,
	schema
} from './database';

// Auth fixtures
export {
	createMockSession,
	createAuthenticatedLocals,
	createUnauthenticatedLocals,
	createMockRequest,
	createMockRequestEvent,
	authenticatedFetch,
	mockAuthValidation,
	createAuthHeaders,
	type MockSession,
	type MockLocals
} from './auth';

// API testing helpers
export {
	callHandler,
	callHandlerAs,
	assertSuccess,
	assertUnauthorized,
	assertForbidden,
	assertNotFound,
	assertBadRequest,
	assertErrorMessage,
	crudTests,
	generateTestUUID,
	testDates,
	type APIResponse,
	type APIErrorResponse
} from './api-helpers';
