// API: Migrate legacy users to new access control system
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/roles';
import { migrateAllUsers, getMigrationStatus, getMigrationBatches } from '$lib/server/security/migrate-users';

// GET - Get migration status
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !isAdmin(locals.user)) {
		return json({ success: false, error: 'Admin access required' }, { status: 403 });
	}

	try {
		const [status, batches] = await Promise.all([
			getMigrationStatus(),
			getMigrationBatches(5)
		]);

		return json({
			success: true,
			status,
			recentBatches: batches
		});
	} catch (error) {
		console.error('[API] Migration status error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST - Execute migration
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user || !isAdmin(locals.user)) {
		return json({ success: false, error: 'Admin access required' }, { status: 403 });
	}

	try {
		console.log(`[API] Migration initiated by ${locals.user.email}`);

		const result = await migrateAllUsers(locals.user.id);

		return json({
			success: result.success,
			migratedCount: result.migratedCount,
			skippedCount: result.skippedCount,
			errors: result.errors,
			batchId: result.batchId
		});
	} catch (error) {
		console.error('[API] Migration execution error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
