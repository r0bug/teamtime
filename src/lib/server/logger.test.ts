/**
 * Logger Integration Test
 *
 * This file demonstrates how to use the logger and can be used to verify
 * that the logger is working correctly once pino is installed.
 *
 * Run this test after installing pino:
 *   npm install pino pino-pretty
 *   node --loader ts-node/esm src/lib/server/logger.test.ts
 */

import {
	logger,
	createLogger,
	logError,
	createRequestLogger,
	LogLevels,
} from './logger';

// Test 1: Basic logging
console.log('\n=== Test 1: Basic Logging ===');
logger.info('Application test started');
logger.debug('This is a debug message');
logger.warn('This is a warning');
logger.error('This is an error message');

// Test 2: Module-specific logger
console.log('\n=== Test 2: Module-Specific Logger ===');
const authLog = createLogger('auth');
authLog.info('User authentication attempt', {
	username: 'testuser',
	ip: '127.0.0.1',
});
authLog.info('Authentication successful', {
	userId: '12345',
	role: 'user',
});

// Test 3: Error logging with stack trace
console.log('\n=== Test 3: Error Logging ===');
const dbLog = createLogger('database');
try {
	throw new Error('Simulated database connection error');
} catch (err) {
	logError(dbLog, err as Error, {
		database: 'teamtime',
		operation: 'connect',
		host: 'localhost',
	});
}

// Test 4: Request logger
console.log('\n=== Test 4: Request Logger ===');
const requestId = crypto.randomUUID();
const reqLog = createRequestLogger('api', requestId, {
	path: '/api/test',
	method: 'GET',
	userAgent: 'Test/1.0',
});

reqLog.info('Request received');
reqLog.debug('Processing request');
reqLog.info('Request completed', {
	statusCode: 200,
	responseTime: 42,
});

// Test 5: Structured data logging
console.log('\n=== Test 5: Structured Data Logging ===');
const inventoryLog = createLogger('inventory');
inventoryLog.info('Inventory update', {
	operation: 'stock_check',
	items: [
		{ sku: 'ITEM-001', quantity: 100, location: 'Warehouse A' },
		{ sku: 'ITEM-002', quantity: 50, location: 'Warehouse B' },
	],
	totalValue: 15000,
	timestamp: new Date().toISOString(),
});

// Test 6: Sensitive data redaction
console.log('\n=== Test 6: Sensitive Data Redaction ===');
const securityLog = createLogger('security');
securityLog.info('Login attempt', {
	username: 'testuser',
	password: 'this-should-be-redacted', // Should be redacted
	token: 'secret-token-12345', // Should be redacted
	apiKey: 'my-api-key', // Should be redacted
	email: 'test@example.com', // Should NOT be redacted
});

// Test 7: Child logger context
console.log('\n=== Test 7: Child Logger Context ===');
const serviceLog = createLogger('user-service');
const operationLog = serviceLog.child({
	operation: 'createUser',
	operationId: crypto.randomUUID(),
});

operationLog.info('Starting user creation');
operationLog.debug('Validating user data');
operationLog.info('User created successfully', { userId: 'new-user-123' });

// Test 8: Performance logging
console.log('\n=== Test 8: Performance Logging ===');
async function performanceTest() {
	const perfLog = createLogger('performance');
	const operationId = crypto.randomUUID();
	const startTime = Date.now();

	perfLog.info('Operation started', {
		operationId,
		operation: 'data-processing',
	});

	// Simulate async work
	await new Promise((resolve) => setTimeout(resolve, 100));

	const duration = Date.now() - startTime;
	perfLog.info('Operation completed', {
		operationId,
		duration,
		status: 'success',
	});
}

await performanceTest();

// Test 9: Multiple loggers in parallel
console.log('\n=== Test 9: Multiple Loggers ===');
const log1 = createLogger('module-1');
const log2 = createLogger('module-2');
const log3 = createLogger('module-3');

log1.info('Message from module 1');
log2.info('Message from module 2');
log3.info('Message from module 3');

// Test 10: Log levels
console.log('\n=== Test 10: Log Levels ===');
const levelLog = createLogger('level-test');

levelLog.trace('TRACE level message');
levelLog.debug('DEBUG level message');
levelLog.info('INFO level message');
levelLog.warn('WARN level message');
levelLog.error('ERROR level message');
levelLog.fatal('FATAL level message');

console.log('\n=== All Tests Completed ===');
console.log('Current log level:', logger.level);
console.log('Environment:', process.env.NODE_ENV || 'development');

export {}; // Make this a module
