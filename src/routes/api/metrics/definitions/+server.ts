/**
 * Metric Definitions API Endpoint
 *
 * Manage metric type definitions and their configurations.
 * GET: List all metric definitions
 * POST: Register a new metric definition (admin only)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLogger } from '$lib/server/logger';
import { isAdmin } from '$lib/server/auth/roles';
import { getMetricDefinitions, registerMetricDefinition } from '$lib/server/services/metrics-service';

const log = createLogger('api:metrics:definitions');

// GET - List all metric definitions
export const GET: RequestHandler = async ({ locals }) => {
	// Require authenticated user
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const definitions = await getMetricDefinitions();

		return json({
			success: true,
			count: definitions.length,
			definitions
		});
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Get metric definitions error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST - Register new metric definition (admin only)
export const POST: RequestHandler = async ({ locals, request }) => {
	// Require authenticated user
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	// Admin only
	if (!isAdmin(locals.user)) {
		return json({ success: false, error: 'Forbidden - Admin access required' }, { status: 403 });
	}

	try {
		const body = await request.json();

		// Validate required fields
		const {
			metricType,
			displayName,
			description,
			unit,
			aggregation,
			availableDimensions,
			sourceTypes
		} = body;

		if (!metricType || typeof metricType !== 'string') {
			return json({ success: false, error: 'metricType is required and must be a string' }, { status: 400 });
		}

		if (!displayName || typeof displayName !== 'string') {
			return json({ success: false, error: 'displayName is required and must be a string' }, { status: 400 });
		}

		if (!availableDimensions || !Array.isArray(availableDimensions)) {
			return json({ success: false, error: 'availableDimensions is required and must be an array' }, { status: 400 });
		}

		if (!sourceTypes || !Array.isArray(sourceTypes)) {
			return json({ success: false, error: 'sourceTypes is required and must be an array' }, { status: 400 });
		}

		// Validate aggregation type
		const validAggregations = ['sum', 'avg', 'min', 'max', 'count'];
		if (aggregation && !validAggregations.includes(aggregation)) {
			return json({
				success: false,
				error: `Invalid aggregation type. Must be one of: ${validAggregations.join(', ')}`
			}, { status: 400 });
		}

		log.info({
			metricType,
			displayName,
			userId: locals.user.id
		}, 'Registering new metric definition');

		const definition = await registerMetricDefinition({
			metricType,
			displayName,
			description: description || null,
			unit: unit || null,
			aggregation: aggregation || 'sum',
			availableDimensions,
			sourceTypes
		});

		log.info({ definitionId: definition.id, metricType }, 'Metric definition registered');

		return json({
			success: true,
			definition
		}, { status: 201 });
	} catch (error) {
		// Check for unique constraint violation
		if (error instanceof Error && error.message.includes('unique')) {
			return json({
				success: false,
				error: 'A metric definition with this type already exists'
			}, { status: 409 });
		}

		log.error({ error, userId: locals.user?.id }, 'Register metric definition error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
