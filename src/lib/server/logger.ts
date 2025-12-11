/**
 * Structured Logging Library using Pino
 *
 * This module provides a centralized logging solution for the TeamTime application.
 * It uses Pino for high-performance JSON logging with support for child loggers
 * and environment-based configuration.
 *
 * Installation required:
 *   npm install pino pino-pretty
 *
 * Usage:
 *   import { logger, createLogger } from '$lib/server/logger';
 *
 *   // Use the root logger
 *   logger.info('Application started');
 *
 *   // Create a module-specific logger
 *   const log = createLogger('auth');
 *   log.info('User logged in', { userId: '123' });
 *   log.error('Failed to authenticate', { error: err.message });
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Get the current environment
 */
function getEnvironment(): string {
	return process.env.NODE_ENV || 'development';
}

/**
 * Determine if we're in development mode
 */
function isDevelopment(): boolean {
	return getEnvironment() === 'development';
}

/**
 * Create the pino logger configuration based on environment
 */
function createLoggerConfig(): LoggerOptions {
	const isDev = isDevelopment();

	const baseConfig: LoggerOptions = {
		level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
		timestamp: pino.stdTimeFunctions.isoTime,
		formatters: {
			level: (label) => {
				return { level: label.toUpperCase() };
			},
		},
		// Redact sensitive information
		redact: {
			paths: [
				'password',
				'token',
				'apiKey',
				'secret',
				'authorization',
				'*.password',
				'*.token',
				'*.apiKey',
				'*.secret',
				'AUTH_SECRET',
				'SMTP_PASSWORD',
				'TWILIO_AUTH_TOKEN',
				'*.AUTH_SECRET',
				'*.SMTP_PASSWORD',
				'*.TWILIO_AUTH_TOKEN',
			],
			censor: '[REDACTED]',
		},
	};

	// In development, use pretty printing for better readability
	if (isDev) {
		return {
			...baseConfig,
			transport: {
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'HH:MM:ss.l',
					ignore: 'pid,hostname',
					singleLine: false,
					messageFormat: '{module} {msg}',
				},
			},
		};
	}

	// In production, use JSON output for structured logging
	return baseConfig;
}

/**
 * Root logger instance
 * This is the base logger that all other loggers are derived from
 */
export const logger: Logger = pino(createLoggerConfig());

/**
 * Create a child logger with a specific module name
 *
 * Child loggers inherit all configuration from the parent but add
 * additional context (the module name) to every log entry.
 *
 * @param moduleName - The name of the module/component using this logger
 * @returns A child logger instance with the module name in context
 *
 * @example
 * ```typescript
 * const log = createLogger('auth');
 * log.info('User authenticated', { userId: '123' });
 * // Output: {"level":"INFO","module":"auth","msg":"User authenticated","userId":"123"}
 * ```
 */
export function createLogger(moduleName: string): Logger {
	return logger.child({ module: moduleName });
}

/**
 * Log an error with full context
 *
 * This is a convenience function for logging errors with stack traces
 * and additional context.
 *
 * @param logger - The logger instance to use
 * @param error - The error object to log
 * @param context - Additional context to include in the log
 *
 * @example
 * ```typescript
 * const log = createLogger('database');
 * try {
 *   await db.query('...');
 * } catch (err) {
 *   logError(log, err as Error, { query: '...', userId: '123' });
 * }
 * ```
 */
export function logError(
	logger: Logger,
	error: Error,
	context?: Record<string, unknown>
): void {
	logger.error(
		{
			err: {
				message: error.message,
				stack: error.stack,
				name: error.name,
				...(error.cause ? { cause: error.cause } : {}),
			},
			...context,
		},
		error.message
	);
}

/**
 * Create a request logger for HTTP requests
 *
 * This creates a child logger with request context that can be used
 * throughout the request lifecycle.
 *
 * @param moduleName - The module handling the request
 * @param requestId - Unique identifier for the request
 * @param additionalContext - Any additional context for the request
 * @returns A child logger with request context
 *
 * @example
 * ```typescript
 * export async function load({ request }) {
 *   const log = createRequestLogger('api', crypto.randomUUID(), {
 *     path: request.url,
 *     method: request.method
 *   });
 *   log.info('Processing request');
 *   // ...
 * }
 * ```
 */
export function createRequestLogger(
	moduleName: string,
	requestId: string,
	additionalContext?: Record<string, unknown>
): Logger {
	return logger.child({
		module: moduleName,
		requestId,
		...additionalContext,
	});
}

/**
 * Log levels available in Pino
 * These can be used for type-safe log level configuration
 */
export const LogLevels = {
	TRACE: 'trace',
	DEBUG: 'debug',
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error',
	FATAL: 'fatal',
} as const;

export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

// Log that the logger has been initialized
logger.info(
	{
		environment: getEnvironment(),
		logLevel: logger.level,
		prettyPrint: isDevelopment(),
	},
	'Logger initialized'
);
