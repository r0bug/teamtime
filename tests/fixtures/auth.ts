/**
 * @module TestFixtures/Auth
 * @description Authentication helpers for API testing.
 *
 * Provides utilities for:
 * - Creating authenticated test sessions
 * - Generating auth cookies for API requests
 * - Mocking Lucia auth for unit tests
 */

import { vi } from 'vitest';
import { testUsers, type MockUser, type UserRole } from './users';

/**
 * Mock session object matching Lucia session structure
 */
export interface MockSession {
	id: string;
	userId: string;
	expiresAt: Date;
	fresh: boolean;
}

/**
 * Mock auth locals structure matching SvelteKit locals
 */
export interface MockLocals {
	user: MockUser | null;
	session: MockSession | null;
}

/**
 * Creates a mock session for a user
 * @param user - The user to create a session for
 */
export function createMockSession(user: MockUser): MockSession {
	return {
		id: `session_${user.id}_${Date.now()}`,
		userId: user.id,
		expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
		fresh: true
	};
}

/**
 * Creates mock locals object for authenticated user
 * @param role - User role to authenticate as
 */
export function createAuthenticatedLocals(role: UserRole): MockLocals {
	const user = testUsers[role];
	return {
		user,
		session: createMockSession(user)
	};
}

/**
 * Creates mock locals object for unauthenticated request
 */
export function createUnauthenticatedLocals(): MockLocals {
	return {
		user: null,
		session: null
	};
}

/**
 * Creates a mock request object for API testing
 * @param options - Request options
 */
export function createMockRequest(options: {
	method?: string;
	url?: string;
	body?: unknown;
	headers?: Record<string, string>;
}): Request {
	const { method = 'GET', url = 'http://localhost:5173/api/test', body, headers = {} } = options;

	const init: RequestInit = {
		method,
		headers: {
			'Content-Type': 'application/json',
			...headers
		}
	};

	if (body && method !== 'GET') {
		init.body = JSON.stringify(body);
	}

	return new Request(url, init);
}

/**
 * Creates a mock RequestEvent for SvelteKit API handlers
 * @param options - Event options
 */
export function createMockRequestEvent(options: {
	request?: Request;
	locals?: MockLocals;
	params?: Record<string, string>;
	url?: URL;
}) {
	const {
		request = createMockRequest({ method: 'GET' }),
		locals = createUnauthenticatedLocals(),
		params = {},
		url = new URL('http://localhost:5173/api/test')
	} = options;

	return {
		request,
		locals,
		params,
		url,
		cookies: {
			get: vi.fn().mockReturnValue(null),
			set: vi.fn(),
			delete: vi.fn(),
			getAll: vi.fn().mockReturnValue([]),
			serialize: vi.fn().mockReturnValue('')
		},
		fetch: vi.fn(),
		getClientAddress: vi.fn().mockReturnValue('127.0.0.1'),
		platform: {},
		route: { id: '/api/test' },
		setHeaders: vi.fn(),
		isDataRequest: false,
		isSubRequest: false
	};
}

/**
 * Helper to make authenticated API request in tests
 * @param baseUrl - Base URL of the API
 * @param path - API path
 * @param options - Fetch options
 * @param sessionCookie - Session cookie value
 */
export async function authenticatedFetch(
	baseUrl: string,
	path: string,
	options: RequestInit = {},
	sessionCookie: string
): Promise<Response> {
	const headers = new Headers(options.headers);
	headers.set('Cookie', `session=${sessionCookie}`);

	return fetch(`${baseUrl}${path}`, {
		...options,
		headers
	});
}

/**
 * Mocks the auth validation to return a specific user
 * Useful for unit testing API handlers
 */
export function mockAuthValidation(user: MockUser | null) {
	return {
		validateSession: vi.fn().mockResolvedValue({
			user: user
				? {
						id: user.id,
						email: user.email,
						username: user.username,
						name: user.name,
						role: user.role
					}
				: null,
			session: user ? createMockSession(user) : null
		})
	};
}

/**
 * Creates headers object with authentication cookie
 * @param sessionId - Session ID to include
 */
export function createAuthHeaders(sessionId: string): Record<string, string> {
	return {
		Cookie: `auth_session=${sessionId}`
	};
}
