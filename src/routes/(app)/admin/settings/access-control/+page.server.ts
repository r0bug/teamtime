import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/roles';
import {
	getAllUserTypes,
	getPermissionMatrix,
	upsertUserType,
	setUserTypePermission,
	removeUserTypePermission,
	seedSystemUserTypes
} from '$lib/server/auth/permissions';
import { syncPermissions, getDiscoverySummary } from '$lib/server/auth/route-discovery';
import { getMigrationStatus, getMigrationBatches, getDefaultUserTypeId } from '$lib/server/security/migrate-users';
import { db, userTypes, permissions, users } from '$lib/server/db';
import { eq, count, isNull } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:access-control');

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get permission matrix
	const matrix = await getPermissionMatrix();

	// Get discovery summary
	const discoverySummary = await getDiscoverySummary();

	// Get users count by type
	const userCounts = await db
		.select({
			userTypeId: users.userTypeId,
			count: count()
		})
		.from(users)
		.groupBy(users.userTypeId);

	const userCountMap = new Map<string | null, number>();
	for (const row of userCounts) {
		userCountMap.set(row.userTypeId, row.count);
	}

	// Get unassigned users count
	const unassignedCount = userCountMap.get(null) || 0;

	// Get migration status and batches
	let migrationStatus = null;
	let migrationBatches: { batchId: string; migratedAt: Date; userCount: number; revertedCount: number }[] = [];
	let defaultUserTypeId = null;

	try {
		migrationStatus = await getMigrationStatus();
		migrationBatches = await getMigrationBatches(5);
		defaultUserTypeId = await getDefaultUserTypeId();
	} catch (e) {
		// Migration tables may not exist yet - that's ok
		log.info('Migration data not available yet (tables may need to be created)');
	}

	return {
		userTypes: matrix.userTypes,
		permissions: matrix.permissions,
		matrix: Object.fromEntries(
			Array.from(matrix.matrix.entries()).map(([userTypeId, perms]) => [
				userTypeId,
				Object.fromEntries(perms.entries())
			])
		),
		discoverySummary,
		userCountMap: Object.fromEntries(userCountMap.entries()),
		unassignedCount,
		migrationStatus,
		migrationBatches,
		defaultUserTypeId
	};
};

export const actions: Actions = {
	// Sync routes from filesystem
	syncRoutes: async ({ locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		try {
			const result = await syncPermissions();
			return {
				success: true,
				message: `Synced ${result.added} new permissions (${result.existing} already existed)`
			};
		} catch (error) {
			log.error({ error }, 'Error syncing routes');
			return fail(500, { error: 'Failed to sync routes' });
		}
	},

	// Seed system user types
	seedTypes: async ({ locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		try {
			await seedSystemUserTypes();
			return { success: true, message: 'System user types seeded' };
		} catch (error) {
			log.error({ error }, 'Error seeding user types');
			return fail(500, { error: 'Failed to seed user types' });
		}
	},

	// Create or update user type
	saveUserType: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const id = formData.get('id') as string | null;
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const basedOnRole = formData.get('basedOnRole') as 'admin' | 'manager' | 'purchaser' | 'staff' | null;
		const priority = parseInt(formData.get('priority') as string, 10) || 50;
		const color = formData.get('color') as string || '#6B7280';
		const isActive = formData.get('isActive') === 'true';

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		try {
			await upsertUserType({
				id: id || undefined,
				name,
				description,
				basedOnRole: basedOnRole || undefined,
				priority,
				color,
				isActive
			});
			return { success: true, message: id ? 'User type updated' : 'User type created' };
		} catch (error) {
			log.error({ error, id, name }, 'Error saving user type');
			return fail(500, { error: 'Failed to save user type' });
		}
	},

	// Delete user type
	deleteUserType: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { error: 'ID is required' });
		}

		// Check if it's a system type
		const [userType] = await db
			.select()
			.from(userTypes)
			.where(eq(userTypes.id, id))
			.limit(1);

		if (userType?.isSystem) {
			return fail(400, { error: 'Cannot delete system user types' });
		}

		try {
			await db.delete(userTypes).where(eq(userTypes.id, id));
			return { success: true, message: 'User type deleted' };
		} catch (error) {
			log.error({ error, id }, 'Error deleting user type');
			return fail(500, { error: 'Failed to delete user type' });
		}
	},

	// Toggle permission for a user type
	togglePermission: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const userTypeId = formData.get('userTypeId') as string;
		const permissionId = formData.get('permissionId') as string;
		const action = formData.get('action') as 'grant' | 'deny' | 'remove';

		if (!userTypeId || !permissionId || !action) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			if (action === 'remove') {
				await removeUserTypePermission(userTypeId, permissionId);
			} else {
				await setUserTypePermission(userTypeId, permissionId, action === 'grant');
			}
			return { success: true };
		} catch (error) {
			log.error({ error, userTypeId, permissionId, action }, 'Error toggling permission');
			return fail(500, { error: 'Failed to update permission' });
		}
	}
};
