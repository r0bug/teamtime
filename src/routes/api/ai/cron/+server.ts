// AI Cron Endpoint - Triggered by external cron to run AI agents
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runOfficeManager, runRevenueOptimizer } from '$lib/ai/orchestrators';
import { CRON_SECRET } from '$env/static/private';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:ai:cron');

// Simple secret-based auth for cron jobs
function validateCronRequest(request: Request): boolean {
	const authHeader = request.headers.get('Authorization');
	const cronSecret = CRON_SECRET || 'teamtime-cron-secret';

	if (authHeader === `Bearer ${cronSecret}`) {
		return true;
	}

	// Also check query param for simple curl testing
	const url = new URL(request.url);
	if (url.searchParams.get('secret') === cronSecret) {
		return true;
	}

	return false;
}

export const GET: RequestHandler = async ({ request, url }) => {
	// Validate request
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const agent = url.searchParams.get('agent') || 'office_manager';
	const force = url.searchParams.get('force') === 'true';

	log.info({ agent, force }, 'AI Cron triggered');

	try {
		if (agent === 'office_manager') {
			const result = await runOfficeManager({ forceRun: force });
			return json({
				success: true,
				agent: 'office_manager',
				runId: result.runId,
				actionsLogged: result.actionsLogged,
				actionsExecuted: result.actionsExecuted,
				errors: result.errors,
				costCents: result.totalCostCents,
				durationMs: result.completedAt.getTime() - result.startedAt.getTime()
			});
		}

		if (agent === 'revenue_optimizer') {
			const analysisWindow = url.searchParams.get('window') || 'past 24 hours';
			const result = await runRevenueOptimizer({ forceRun: force, analysisWindow });
			return json({
				success: true,
				agent: 'revenue_optimizer',
				runId: result.runId,
				actionsLogged: result.actionsLogged,
				actionsExecuted: result.actionsExecuted,
				errors: result.errors,
				costCents: result.totalCostCents,
				durationMs: result.completedAt.getTime() - result.startedAt.getTime()
			});
		}

		return json({ error: `Unknown agent: ${agent}` }, { status: 400 });
	} catch (error) {
		log.error({ error, agent }, 'AI Cron GET error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST endpoint for more complex triggers
export const POST: RequestHandler = async ({ request }) => {
	if (!validateCronRequest(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const agent = body.agent || 'office_manager';
		const force = body.force === true;

		if (agent === 'office_manager') {
			const result = await runOfficeManager({ forceRun: force });
			return json({
				success: true,
				agent: 'office_manager',
				runId: result.runId,
				actionsLogged: result.actionsLogged,
				actionsExecuted: result.actionsExecuted,
				errors: result.errors,
				costCents: result.totalCostCents
			});
		}

		if (agent === 'revenue_optimizer') {
			const analysisWindow = body.analysisWindow || 'past 24 hours';
			const result = await runRevenueOptimizer({ forceRun: force, analysisWindow });
			return json({
				success: true,
				agent: 'revenue_optimizer',
				runId: result.runId,
				actionsLogged: result.actionsLogged,
				actionsExecuted: result.actionsExecuted,
				errors: result.errors,
				costCents: result.totalCostCents
			});
		}

		return json({ error: `Unknown agent: ${agent}` }, { status: 400 });
	} catch (error) {
		log.error({ error, agent: body.agent }, 'AI Cron POST error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
