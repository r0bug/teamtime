import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processPendingJobs, getJobStats } from '$lib/server/jobs';
import { CRON_SECRET } from '$env/static/private';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:jobs:process');

// POST /api/jobs/process - Process pending jobs (called by cron)
export const POST: RequestHandler = async ({ request }) => {
	// Verify cron secret
	const authHeader = request.headers.get('Authorization');
	const cronSecret = CRON_SECRET;

	if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const result = await processPendingJobs(10);

		return json({
			success: true,
			...result
		});
	} catch (error) {
		log.error({ error }, 'Error processing jobs');
		return json({
			error: 'Failed to process jobs',
			message: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// GET /api/jobs/process - Get job queue stats
export const GET: RequestHandler = async ({ request, locals }) => {
	// Only managers can view job stats
	if (!locals.user || !['manager', 'admin'].includes(locals.user.role)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const stats = await getJobStats();
		return json({ stats });
	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Error getting job stats');
		return json({ error: 'Failed to get job stats' }, { status: 500 });
	}
};
