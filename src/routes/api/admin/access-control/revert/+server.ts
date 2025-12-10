// API: Revert user migrations
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import { revertMigrationBatch, revertAllToDefault } from '$lib/server/security/migrate-users';

// POST - Revert migration
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || !isAdmin(locals.user)) {
		return json({ success: false, error: 'Admin access required' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { action, batchId } = body;

		if (action === 'revert_batch' && batchId) {
			console.log(`[API] Reverting batch ${batchId} by ${locals.user.email}`);
			const result = await revertMigrationBatch(batchId, locals.user.id);
			return json({
				success: result.success,
				revertedCount: result.revertedCount,
				errors: result.errors
			});
		}

		if (action === 'revert_to_default') {
			console.log(`[API] Reverting all to default by ${locals.user.email}`);
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
		console.error('[API] Revert error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
