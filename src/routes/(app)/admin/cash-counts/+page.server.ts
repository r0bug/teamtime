import type { PageServerLoad, Actions } from './$types';
import { db, cashCountConfigs, cashCounts, locations, users, taskAssignmentRules } from '$lib/server/db';
import { eq, desc, and, isNotNull } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { redirect, fail } from '@sveltejs/kit';

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

	// Get existing auto-assignment rules linked to cash count configs with clock_in trigger
	const autoRules = await db
		.select({
			id: taskAssignmentRules.id,
			name: taskAssignmentRules.name,
			cashCountConfigId: taskAssignmentRules.cashCountConfigId,
			triggerType: taskAssignmentRules.triggerType,
			isActive: taskAssignmentRules.isActive,
			triggerCount: taskAssignmentRules.triggerCount,
			lastTriggeredAt: taskAssignmentRules.lastTriggeredAt
		})
		.from(taskAssignmentRules)
		.where(
			and(
				isNotNull(taskAssignmentRules.cashCountConfigId),
				eq(taskAssignmentRules.triggerType, 'clock_in')
			)
		)
		.orderBy(desc(taskAssignmentRules.createdAt));

	return {
		configs,
		recentCounts,
		locations: allLocations,
		autoRules
	};
};

export const actions: Actions = {
	setupAutoCount: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const cashCountConfigId = formData.get('cashCountConfigId') as string;

		if (!cashCountConfigId) {
			return fail(400, { error: 'Please select a cash count config' });
		}

		// Verify config exists
		const [config] = await db
			.select({ id: cashCountConfigs.id, name: cashCountConfigs.name })
			.from(cashCountConfigs)
			.where(eq(cashCountConfigs.id, cashCountConfigId));

		if (!config) {
			return fail(400, { error: 'Cash count config not found' });
		}

		// Check if a clock_in rule already exists for this config
		const [existing] = await db
			.select({ id: taskAssignmentRules.id })
			.from(taskAssignmentRules)
			.where(
				and(
					eq(taskAssignmentRules.cashCountConfigId, cashCountConfigId),
					eq(taskAssignmentRules.triggerType, 'clock_in')
				)
			);

		if (existing) {
			return fail(400, { error: 'An auto till count rule already exists for this config. Toggle it from the list below.' });
		}

		// Create the assignment rule
		await db.insert(taskAssignmentRules).values({
			name: `Auto Till Count at Clock-In (${config.name})`,
			description: `Automatically creates a cash count task when any staff member clocks in, using the "${config.name}" config.`,
			cashCountConfigId,
			triggerType: 'clock_in',
			triggerConfig: {},
			assignmentType: 'clocked_in_user',
			assignmentConfig: null,
			priority: 10,
			isActive: true,
			createdBy: locals.user!.id
		});

		return { success: true };
	},

	toggleAutoRule: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const ruleId = formData.get('ruleId') as string;

		if (!ruleId) {
			return fail(400, { error: 'Rule ID required' });
		}

		const [rule] = await db
			.select({ id: taskAssignmentRules.id, isActive: taskAssignmentRules.isActive })
			.from(taskAssignmentRules)
			.where(eq(taskAssignmentRules.id, ruleId));

		if (!rule) {
			return fail(404, { error: 'Rule not found' });
		}

		await db
			.update(taskAssignmentRules)
			.set({ isActive: !rule.isActive, updatedAt: new Date() })
			.where(eq(taskAssignmentRules.id, ruleId));

		return { success: true };
	},

	deleteAutoRule: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const ruleId = formData.get('ruleId') as string;

		if (!ruleId) {
			return fail(400, { error: 'Rule ID required' });
		}

		await db
			.delete(taskAssignmentRules)
			.where(eq(taskAssignmentRules.id, ruleId));

		return { success: true };
	}
};
