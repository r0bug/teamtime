/**
 * @module TestFixtures/APIHelpers
 * @description Helper functions for API endpoint testing.
 *
 * Provides utilities for:
 * - Making API requests in tests
 * - Parsing and validating responses
 * - Common assertions for API testing
 */

import { expect } from 'vitest';
import { createMockRequestEvent, createAuthenticatedLocals, type MockLocals } from './auth';
import type { UserRole } from './users';

/**
 * Standard API response structure
 */
export interface APIResponse<T = unknown> {
	status: number;
	ok: boolean;
	data: T;
	headers: Headers;
}

/**
 * Error response structure from API
 */
export interface APIErrorResponse {
	error: string;
	message?: string;
	details?: unknown;
}

/**
 * Helper to call a SvelteKit API handler directly
 * @param handler - The API handler function (GET, POST, etc.)
 * @param options - Request options
 */
export async function callHandler<T>(
	handler: (event: ReturnType<typeof createMockRequestEvent>) => Promise<Response>,
	options: {
		method?: string;
		body?: unknown;
		params?: Record<string, string>;
		locals?: MockLocals;
		headers?: Record<string, string>;
		url?: string;
	} = {}
): Promise<APIResponse<T>> {
	const { method = 'GET', body, params = {}, locals, headers = {}, url = 'http://localhost:5173/api/test' } = options;

	const requestInit: RequestInit = {
		method,
		headers: {
			'Content-Type': 'application/json',
			...headers
		}
	};

	if (body && method !== 'GET') {
		requestInit.body = JSON.stringify(body);
	}

	const request = new Request(url, requestInit);
	const event = createMockRequestEvent({
		request,
		locals: locals || { user: null, session: null },
		params,
		url: new URL(url)
	});

	const response = await handler(event as any);
	const responseData = await response.json().catch(() => null);

	return {
		status: response.status,
		ok: response.ok,
		data: responseData as T,
		headers: response.headers
	};
}

/**
 * Helper to call handler as authenticated user
 * @param handler - The API handler function
 * @param role - User role to authenticate as
 * @param options - Request options
 */
export async function callHandlerAs<T>(
	handler: (event: ReturnType<typeof createMockRequestEvent>) => Promise<Response>,
	role: UserRole,
	options: Omit<Parameters<typeof callHandler>[1], 'locals'> = {}
): Promise<APIResponse<T>> {
	return callHandler<T>(handler, {
		...options,
		locals: createAuthenticatedLocals(role)
	});
}

/**
 * Assert response is successful (2xx status)
 */
export function assertSuccess<T>(response: APIResponse<T>): asserts response is APIResponse<T> & { ok: true } {
	expect(response.ok, `Expected success but got status ${response.status}: ${JSON.stringify(response.data)}`).toBe(
		true
	);
}

/**
 * Assert response is 401 Unauthorized
 */
export function assertUnauthorized(response: APIResponse): void {
	expect(response.status).toBe(401);
	expect(response.ok).toBe(false);
}

/**
 * Assert response is 403 Forbidden
 */
export function assertForbidden(response: APIResponse): void {
	expect(response.status).toBe(403);
	expect(response.ok).toBe(false);
}

/**
 * Assert response is 404 Not Found
 */
export function assertNotFound(response: APIResponse): void {
	expect(response.status).toBe(404);
	expect(response.ok).toBe(false);
}

/**
 * Assert response is 400 Bad Request
 */
export function assertBadRequest(response: APIResponse): void {
	expect(response.status).toBe(400);
	expect(response.ok).toBe(false);
}

/**
 * Assert response contains specific error message
 */
export function assertErrorMessage(response: APIResponse<APIErrorResponse>, expectedMessage: string | RegExp): void {
	expect(response.ok).toBe(false);
	if (typeof expectedMessage === 'string') {
		expect(response.data.error || response.data.message).toContain(expectedMessage);
	} else {
		expect(response.data.error || response.data.message).toMatch(expectedMessage);
	}
}

/**
 * Common test patterns for CRUD endpoints
 */
export const crudTests = {
	/**
	 * Test that unauthenticated requests are rejected
	 */
	async testRequiresAuth(handler: (event: any) => Promise<Response>, method = 'GET') {
		const response = await callHandler(handler, { method });
		assertUnauthorized(response);
	},

	/**
	 * Test that non-admin/manager users are forbidden
	 */
	async testRequiresManagerRole(handler: (event: any) => Promise<Response>, method = 'GET') {
		const staffResponse = await callHandlerAs(handler, 'staff', { method });
		assertForbidden(staffResponse);

		const purchaserResponse = await callHandlerAs(handler, 'purchaser', { method });
		assertForbidden(purchaserResponse);
	},

	/**
	 * Test that only admins can access
	 */
	async testRequiresAdminRole(handler: (event: any) => Promise<Response>, method = 'GET') {
		const staffResponse = await callHandlerAs(handler, 'staff', { method });
		assertForbidden(staffResponse);

		const purchaserResponse = await callHandlerAs(handler, 'purchaser', { method });
		assertForbidden(purchaserResponse);

		const managerResponse = await callHandlerAs(handler, 'manager', { method });
		assertForbidden(managerResponse);
	}
};

/**
 * Generates a valid UUID for testing
 */
export function generateTestUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Creates test date strings in ISO format
 */
export const testDates = {
	today: () => new Date().toISOString().split('T')[0],
	yesterday: () => {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return d.toISOString().split('T')[0];
	},
	tomorrow: () => {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return d.toISOString().split('T')[0];
	},
	daysAgo: (days: number) => {
		const d = new Date();
		d.setDate(d.getDate() - days);
		return d.toISOString().split('T')[0];
	},
	daysFromNow: (days: number) => {
		const d = new Date();
		d.setDate(d.getDate() + days);
		return d.toISOString().split('T')[0];
	}
};
