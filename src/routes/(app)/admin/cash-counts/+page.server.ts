import type { PageServerLoad } from './$types';
import { db, cashCountConfigs, cashCounts, locations, users } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get all cash count configs
	const configs = await db
		.select({
			id: cashCountConfigs.id,
			locationId: cashCountConfigs.locationId,
			locationName: locations.name,
			name: cashCountConfigs.name,
			fields: cashCountConfigs.fields,
			triggerType: cashCountConfigs.triggerType,
			isActive: cashCountConfigs.isActive,
			createdAt: cashCountConfigs.createdAt
		})
		.from(cashCountConfigs)
		.leftJoin(locations, eq(cashCountConfigs.locationId, locations.id))
		.orderBy(desc(cashCountConfigs.createdAt));

	// Get recent cash counts
	const recentCounts = await db
		.select({
			id: cashCounts.id,
			configId: cashCounts.configId,
			userId: cashCounts.userId,
			userName: users.name,
			locationId: cashCounts.locationId,
			locationName: locations.name,
			totalAmount: cashCounts.totalAmount,
			submittedAt: cashCounts.submittedAt
		})
		.from(cashCounts)
		.leftJoin(users, eq(cashCounts.userId, users.id))
		.leftJoin(locations, eq(cashCounts.locationId, locations.id))
		.orderBy(desc(cashCounts.submittedAt))
		.limit(20);

	// Get all locations for config creation
	const allLocations = await db.select().from(locations);

	return {
		configs,
		recentCounts,
		locations: allLocations
	};
};
