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
	logger.debug('Debug information', { config: { port: 5173 } });
	logger.warn('This is a warning message');
	logger.error('An error occurred', { errorCode: 500 });
}

// ============================================================================
// Example 2: Module-Specific Logging
// ============================================================================

export function example2_moduleLogger() {
	// Create a logger for a specific module
	const authLog = createLogger('auth');

	authLog.info('User login attempt', { username: 'john.doe', ip: '192.168.1.1' });
	authLog.info('User authenticated successfully', { userId: '123', role: 'admin' });
	authLog.warn('Failed login attempt', {
		username: 'jane.doe',
		reason: 'invalid_password',
		attemptCount: 3,
	});
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
	log.debug('Fetching user from database', { userId: '123' });

	// Log response
	log.info('Request completed', {
		statusCode: 200,
		responseTime: 45, // ms
	});
}

// ============================================================================
// Example 5: Structured Data Logging
// ============================================================================

export function example5_structuredLogging() {
	const inventoryLog = createLogger('inventory');

	// Log complex structured data
	inventoryLog.info('Inventory updated', {
		operation: 'stock_replenishment',
		items: [
			{ id: 'ITEM-001', quantity: 50, location: 'Warehouse A' },
			{ id: 'ITEM-002', quantity: 30, location: 'Warehouse B' },
		],
		totalValue: 12500.0,
		timestamp: new Date().toISOString(),
	});
}

// ============================================================================
// Example 6: Performance Monitoring
// ============================================================================

export async function example6_performanceMonitoring() {
	const perfLog = createLogger('performance');
	const operationId = crypto.randomUUID();

	const startTime = Date.now();

	perfLog.info('Operation started', { operationId, operation: 'data_processing' });

	try {
		// Simulate async operation
		await new Promise((resolve) => setTimeout(resolve, 100));

		const duration = Date.now() - startTime;
		perfLog.info('Operation completed', {
			operationId,
			duration,
			status: 'success',
		});
	} catch (err) {
		const duration = Date.now() - startTime;
		perfLog.error('Operation failed', {
			operationId,
			duration,
			status: 'failure',
			error: (err as Error).message,
		});
	}
}

// ============================================================================
// Example 7: Conditional Logging Based on Log Level
// ============================================================================

export function example7_conditionalLogging() {
	const debugLog = createLogger('debug-example');

	// These will only appear if log level is set to 'debug' or 'trace'
	debugLog.debug('Detailed debugging information', {
		variables: { x: 10, y: 20 },
		state: 'processing',
	});

	// Check if debug is enabled before expensive operations
	if (debugLog.level === LogLevels.DEBUG || debugLog.level === LogLevels.TRACE) {
		// Only perform this expensive operation if we're actually going to log it
		const expensiveDebugData = generateExpensiveDebugData();
		debugLog.debug('Expensive debug data', expensiveDebugData);
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
		log.info('Data loaded successfully', { recordCount: data.length });

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
		log.debug('Request body parsed', { bodySize: JSON.stringify(body).length });

		// Process request
		const result = await processRequest(body);

		log.info('Request processed successfully', { resultId: result.id });

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
		this.log.info('Creating new user', { email: userData.email });

		try {
			// Create user in database
			const user = await this.saveToDatabase(userData);

			this.log.info('User created successfully', {
				userId: user.id,
				email: user.email,
			});

			return user;
		} catch (err) {
			logError(this.log, err as Error, { userData });
			throw err;
		}
	}

	async deleteUser(userId: string) {
		this.log.warn('Deleting user', { userId });

		try {
			await this.deleteFromDatabase(userId);

			this.log.info('User deleted', { userId });
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
	secLog.warn('Suspicious activity detected', {
		event: 'multiple_failed_logins',
		username: 'admin',
		ip: '192.168.1.100',
		attemptCount: 5,
		timeWindow: '5 minutes',
	});

	secLog.info('Permission granted', {
		userId: '123',
		resource: '/admin/settings',
		action: 'update',
		timestamp: new Date().toISOString(),
	});

	secLog.error('Security violation', {
		event: 'unauthorized_access_attempt',
		userId: '456',
		resource: '/admin/users',
		action: 'delete',
		blocked: true,
	});
}

// ============================================================================
// Example 12: Background Job Logging
// ============================================================================

export async function example12_backgroundJob() {
	const jobLog = createLogger('background-job');
	const jobId = crypto.randomUUID();

	jobLog.info('Job started', {
		jobId,
		jobType: 'inventory-sync',
		scheduledTime: new Date().toISOString(),
	});

	try {
		// Process job
		const results = await runJob();

		jobLog.info('Job completed', {
			jobId,
			status: 'success',
			itemsProcessed: results.processed,
			duration: results.duration,
		});
	} catch (err) {
		logError(jobLog, err as Error, { jobId, jobType: 'inventory-sync' });

		jobLog.error('Job failed', {
			jobId,
			status: 'failed',
			willRetry: true,
		});
	}
}

async function runJob() {
	return { processed: 100, duration: 5000 };
}
