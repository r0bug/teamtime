// API: Revert user migrations
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import { revertMigrationBatch, revertAllToDefault } from '$lib/server/security/migrate-users';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:admin:access-control:revert');

// POST - Revert migration
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || !isAdmin(locals.user)) {
		return json({ success: false, error: 'Admin access required' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { action, batchId } = body;

		if (action === 'revert_batch' && batchId) {
			log.info({ batchId, userId: locals.user.id, email: locals.user.email }, 'Reverting batch');
			const result = await revertMigrationBatch(batchId, locals.user.id);
			return json({
				success: result.success,
				revertedCount: result.revertedCount,
				errors: result.errors
			});
		}

		if (action === 'revert_to_default') {
			log.info({ userId: locals.user.id, email: locals.user.email }, 'Reverting all to default');
			const result = await revertAllToDefault(locals.user.id);
			return json({
				success: result.success,
				revertedCount: result.revertedCount,
				errors: result.errors
			});
		}

		return json({
			success: false,
			error: 'Invalid action. Use "revert_batch" with batchId or "revert_to_default"'
		}, { status: 400 });

	} catch (error) {
		log.error({ error, userId: locals.user?.id }, 'Revert error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
