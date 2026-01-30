/**
 * Logger Usage Examples
 *
 * This file demonstrates various ways to use the structured logging library.
 * These examples are for documentation purposes.
 */

import {
	logger,
	createLogger,
	logError,
	createRequestLogger,
	LogLevels,
	type LogLevel,
} from './logger';

// ============================================================================
// Example 1: Basic Logging with Root Logger
// ============================================================================

export function example1_basicLogging() {
	// Use the root logger for general application logs
	logger.info('Application starting...');
	logger.debug({ config: { port: 5173 } }, 'Debug information');
	logger.warn('This is a warning message');
	logger.error({ errorCode: 500 }, 'An error occurred');
}

// ============================================================================
// Example 2: Module-Specific Logging
// ============================================================================

export function example2_moduleLogger() {
	// Create a logger for a specific module
	const authLog = createLogger('auth');

	authLog.info({ username: 'john.doe', ip: '192.168.1.1' }, 'User login attempt');
	authLog.info({ userId: '123', role: 'admin' }, 'User authenticated successfully');
	authLog.warn(
		{
			username: 'jane.doe',
			reason: 'invalid_password',
			attemptCount: 3,
		},
		'Failed login attempt'
	);
}

// ============================================================================
// Example 3: Error Logging with Stack Traces
// ============================================================================

export function example3_errorLogging() {
	const dbLog = createLogger('database');

	try {
		// Simulate a database operation
		throw new Error('Connection timeout');
	} catch (err) {
		// Use logError helper for proper error logging
		logError(dbLog, err as Error, {
			query: 'SELECT * FROM users',
			database: 'teamtime',
			timeout: 5000,
		});
	}
}

// ============================================================================
// Example 4: Request Logging in SvelteKit Endpoints
// ============================================================================

export function example4_requestLogging() {
	// Simulate a SvelteKit load function
	const requestId = crypto.randomUUID();
	const log = createRequestLogger('api', requestId, {
		path: '/api/users/123',
		method: 'GET',
		userAgent: 'Mozilla/5.0...',
	});

	log.info('Request received');

	// Process request...
	log.debug({ userId: '123' }, 'Fetching user from database');

	// Log response
	log.info(
		{
			statusCode: 200,
			responseTime: 45, // ms
		},
		'Request completed'
	);
}

// ============================================================================
// Example 5: Structured Data Logging
// ============================================================================

export function example5_structuredLogging() {
	const inventoryLog = createLogger('inventory');

	// Log complex structured data
	inventoryLog.info(
		{
			operation: 'stock_replenishment',
			items: [
				{ id: 'ITEM-001', quantity: 50, location: 'Warehouse A' },
				{ id: 'ITEM-002', quantity: 30, location: 'Warehouse B' },
			],
			totalValue: 12500.0,
			timestamp: new Date().toISOString(),
		},
		'Inventory updated'
	);
}

// ============================================================================
// Example 6: Performance Monitoring
// ============================================================================

export async function example6_performanceMonitoring() {
	const perfLog = createLogger('performance');
	const operationId = crypto.randomUUID();

	const startTime = Date.now();

	perfLog.info({ operationId, operation: 'data_processing' }, 'Operation started');

	try {
		// Simulate async operation
		await new Promise((resolve) => setTimeout(resolve, 100));

		const duration = Date.now() - startTime;
		perfLog.info(
			{
				operationId,
				duration,
				status: 'success',
			},
			'Operation completed'
		);
	} catch (err) {
		const duration = Date.now() - startTime;
		perfLog.error(
			{
				operationId,
				duration,
				status: 'failure',
				error: (err as Error).message,
			},
			'Operation failed'
		);
	}
}

// ============================================================================
// Example 7: Conditional Logging Based on Log Level
// ============================================================================

export function example7_conditionalLogging() {
	const debugLog = createLogger('debug-example');

	// These will only appear if log level is set to 'debug' or 'trace'
	debugLog.debug(
		{
			variables: { x: 10, y: 20 },
			state: 'processing',
		},
		'Detailed debugging information'
	);

	// Check if debug is enabled before expensive operations
	if (debugLog.level === LogLevels.DEBUG || debugLog.level === LogLevels.TRACE) {
		// Only perform this expensive operation if we're actually going to log it
		const expensiveDebugData = generateExpensiveDebugData();
		debugLog.debug(expensiveDebugData, 'Expensive debug data');
	}
}

function generateExpensiveDebugData() {
	// Simulate expensive operation
	return { complex: 'data structure' };
}

// ============================================================================
// Example 8: SvelteKit Server Load Function Integration
// ============================================================================

export async function load({ params, request }: { params: any; request: Request }) {
	const log = createRequestLogger('page-load', crypto.randomUUID(), {
		path: request.url,
		params,
	});

	log.info('Loading page data');

	try {
		// Fetch data
		const data = await fetchData();
		log.info({ recordCount: data.length }, 'Data loaded successfully');

		return { data };
	} catch (err) {
		logError(log, err as Error, { params });
		throw err;
	}
}

async function fetchData() {
	return [];
}

// ============================================================================
// Example 9: API Endpoint Integration
// ============================================================================

export async function POST({ request }: { request: Request }) {
	const log = createRequestLogger('api-endpoint', crypto.randomUUID(), {
		path: request.url,
		method: 'POST',
	});

	log.info('API request received');

	try {
		const body = await request.json();
		log.debug({ bodySize: JSON.stringify(body).length }, 'Request body parsed');

		// Process request
		const result = await processRequest(body);

		log.info({ resultId: result.id }, 'Request processed successfully');

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err) {
		logError(log, err as Error);

		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}
}

async function processRequest(body: any) {
	return { id: '123' };
}

// ============================================================================
// Example 10: Service Layer Integration
// ============================================================================

export class UserService {
	private log = createLogger('user-service');

	async createUser(userData: { name: string; email: string }) {
		this.log.info({ email: userData.email }, 'Creating new user');

		try {
			// Create user in database
			const user = await this.saveToDatabase(userData);

			this.log.info(
				{
					userId: user.id,
					email: user.email,
				},
				'User created successfully'
			);

			return user;
		} catch (err) {
			logError(this.log, err as Error, { userData });
			throw err;
		}
	}

	async deleteUser(userId: string) {
		this.log.warn({ userId }, 'Deleting user');

		try {
			await this.deleteFromDatabase(userId);

			this.log.info({ userId }, 'User deleted');
		} catch (err) {
			logError(this.log, err as Error, { userId });
			throw err;
		}
	}

	private async saveToDatabase(userData: any) {
		return { id: '123', ...userData };
	}

	private async deleteFromDatabase(userId: string) {
		// Delete user
	}
}

// ============================================================================
// Example 11: Security Audit Logging
// ============================================================================

export function example11_securityLogging() {
	const secLog = createLogger('security');

	// Log security events
	secLog.warn(
		{
			event: 'multiple_failed_logins',
			username: 'admin',
			ip: '192.168.1.100',
			attemptCount: 5,
			timeWindow: '5 minutes',
		},
		'Suspicious activity detected'
	);

	secLog.info(
		{
			userId: '123',
			resource: '/admin/settings',
			action: 'update',
			timestamp: new Date().toISOString(),
		},
		'Permission granted'
	);

	secLog.error(
		{
			event: 'unauthorized_access_attempt',
			userId: '456',
			resource: '/admin/users',
			action: 'delete',
			blocked: true,
		},
		'Security violation'
	);
}

// ============================================================================
// Example 12: Background Job Logging
// ============================================================================

export async function example12_backgroundJob() {
	const jobLog = createLogger('background-job');
	const jobId = crypto.randomUUID();

	jobLog.info(
		{
			jobId,
			jobType: 'inventory-sync',
			scheduledTime: new Date().toISOString(),
		},
		'Job started'
	);

	try {
		// Process job
		const results = await runJob();

		jobLog.info(
			{
				jobId,
				status: 'success',
				itemsProcessed: results.processed,
				duration: results.duration,
			},
			'Job completed'
		);
	} catch (err) {
		logError(jobLog, err as Error, { jobId, jobType: 'inventory-sync' });

		jobLog.error(
			{
				jobId,
				status: 'failed',
				willRetry: true,
			},
			'Job failed'
		);
	}
}

async function runJob() {
	return { processed: 100, duration: 5000 };
}
