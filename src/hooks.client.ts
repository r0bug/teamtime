import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, event }) => {
	const err = error instanceof Error ? error : new Error(String(error));

	// Log to console in development; in production this could go to an error service
	console.error('[Client Error]', {
		message: err.message,
		stack: err.stack,
		url: event.url?.href
	});

	return {
		message: 'An unexpected error occurred'
	};
};
