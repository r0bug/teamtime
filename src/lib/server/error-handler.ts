import { createLogger } from '$lib/server/logger';

const log = createLogger('error-handler');

/**
 * Centralized error handler for server-side errors.
 * Logs errors with full context for debugging.
 */
export function handleServerError(
	error: unknown,
	context: {
		userId?: string;
		route?: string;
		method?: string;
		event?: string;
	} = {}
): { message: string; status: number } {
	const err = error instanceof Error ? error : new Error(String(error));

	log.error(
		{
			err,
			userId: context.userId,
			route: context.route,
			method: context.method,
			event: context.event,
			stack: err.stack
		},
		`Unhandled error: ${err.message}`
	);

	// Don't expose internal error details to the client
	return {
		message: 'An unexpected error occurred',
		status: 500
	};
}

/**
 * Handle expected errors (validation, auth, not found, etc.)
 * These get a lower log level since they're not bugs.
 */
export function handleExpectedError(
	message: string,
	status: number,
	context: {
		userId?: string;
		route?: string;
	} = {}
): { message: string; status: number } {
	if (status >= 500) {
		log.error({ ...context, status }, message);
	} else if (status >= 400) {
		log.warn({ ...context, status }, message);
	}

	return { message, status };
}
