import type { PageServerLoad, Actions } from './$types';
import { redirect, fail, error } from '@sveltejs/kit';
import { db, taskAssignmentRules, taskTemplates, locations, users, cashCountConfigs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:tasks:rules:edit');

type RuleTriggerType =
	| 'clock_in'
	| 'clock_out'
	| 'first_clock_in'
	| 'last_clock_out'
	| 'time_into_shift'
	| 'task_completed'
	| 'schedule'
	| 'closing_shift';
type AssignmentType =
	| 'specific_user'
	| 'clocked_in_user'
	| 'role_rotation'
	| 'location_staff'
	| 'least_tasks';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const rule = await db
		.select()
		.from(taskAssignmentRules)
		.where(eq(taskAssignmentRules.id, params.id))
		.limit(1);

	if (!rule[0]) {
		throw error(404, 'Rule not found');
	}

	// Get active templates
	const templates = await db
		.select({
			id: taskTemplates.id,
			name: taskTemplates.name
		})
		.from(taskTemplates)
		.where(eq(taskTemplates.isActive, true))
		.orderBy(taskTemplates.name);

	// Get active locations
	const allLocations = await db
		.select({
			id: locations.id,
			name: locations.name
		})
		.from(locations)
		.where(eq(locations.isActive, true))
		.orderBy(locations.name);

	// Get active users
	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	// Get active cash count configs
	const cashCountConfigList = await db
		.select({
			id: cashCountConfigs.id,
			name: cashCountConfigs.name,
			locationId: cashCountConfigs.locationId,
			locationName: locations.name
		})
		.from(cashCountConfigs)
		.leftJoin(locations, eq(cashCountConfigs.locationId, locations.id))
		.where(eq(cashCountConfigs.isActive, true))
		.orderBy(cashCountConfigs.name);

	return {
		rule: rule[0],
		templates,
		locations: allLocations,
		users: allUsers,
		cashCountConfigs: cashCountConfigList
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();

		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const taskType = formData.get('taskType') as string;
		const templateId = formData.get('templateId') as string;
		const cashCountConfigId = formData.get('cashCountConfigId') as string;
		const triggerType = formData.get('triggerType') as string;
		const assignmentType = formData.get('assignmentType') as string;
		const priority = parseInt(formData.get('priority') as string, 10) || 0;
		const isActive = formData.get('isActive') === 'on';

		if (!name?.trim()) {
			return fail(400, { error: 'Rule name is required' });
		}

		// Validate task type - either template or cash count config must be provided
		if (taskType === 'cash_count') {
			if (!cashCountConfigId) {
				return fail(400, { error: 'Cash count config is required' });
			}
		} else {
			if (!templateId) {
				return fail(400, { error: 'Task template is required' });
			}
		}

		if (!triggerType) {
			return fail(400, { error: 'Trigger type is required' });
		}
		if (!assignmentType) {
			return fail(400, { error: 'Assignment type is required' });
		}

		// Build trigger config
		const triggerConfig: Record<string, unknown> = {};
		if (triggerType === 'time_into_shift') {
			const hoursIntoShift = parseFloat(formData.get('hoursIntoShift') as string);
			if (!hoursIntoShift || hoursIntoShift <= 0) {
				return fail(400, { error: 'Hours into shift must be a positive number' });
			}
			triggerConfig.hoursIntoShift = hoursIntoShift;
		} else if (triggerType === 'task_completed') {
			const taskTemplateId = formData.get('triggerTaskTemplateId') as string;
			if (!taskTemplateId) {
				return fail(400, { error: 'Trigger task template is required' });
			}
			triggerConfig.taskTemplateId = taskTemplateId;
		} else if (triggerType === 'schedule') {
			const cronExpression = formData.get('cronExpression') as string;
			if (!cronExpression?.trim()) {
				return fail(400, { error: 'Cron expression is required for scheduled triggers' });
			}
			triggerConfig.cronExpression = cronExpression.trim();
		} else if (triggerType === 'closing_shift') {
			const triggerTime = formData.get('triggerTime') as string;
			if (!triggerTime?.trim()) {
				return fail(400, { error: 'Trigger time is required for closing shift triggers' });
			}
			triggerConfig.triggerTime = triggerTime.trim();
		}

		// Build conditions
		const conditions: Record<string, unknown> = {};
		const conditionLocationId = formData.get('conditionLocationId') as string;
		const conditionRoles = formData.getAll('conditionRoles') as string[];
		const conditionDaysOfWeek = formData.getAll('conditionDaysOfWeek').map(Number);
		const conditionTimeWindowStart = formData.get('conditionTimeWindowStart') as string;
		const conditionTimeWindowEnd = formData.get('conditionTimeWindowEnd') as string;

		if (conditionLocationId) conditions.locationId = conditionLocationId;
		if (conditionRoles.length > 0) conditions.roles = conditionRoles;
		if (conditionDaysOfWeek.length > 0 && conditionDaysOfWeek.length < 7) {
			conditions.daysOfWeek = conditionDaysOfWeek;
		}
		if (conditionTimeWindowStart) conditions.timeWindowStart = conditionTimeWindowStart;
		if (conditionTimeWindowEnd) conditions.timeWindowEnd = conditionTimeWindowEnd;

		// Build assignment config
		const assignmentConfig: Record<string, unknown> = {};
		if (assignmentType === 'specific_user') {
			const userId = formData.get('assignmentUserId') as string;
			if (!userId) {
				return fail(400, { error: 'Specific user is required for this assignment type' });
			}
			assignmentConfig.userId = userId;
		} else if (assignmentType === 'role_rotation' || assignmentType === 'location_staff' || assignmentType === 'least_tasks') {
			const assignmentRoles = formData.getAll('assignmentRoles') as string[];
			if (assignmentRoles.length > 0) {
				assignmentConfig.roles = assignmentRoles;
			}
		}

		try {
			await db
				.update(taskAssignmentRules)
				.set({
					name: name.trim(),
					description: description?.trim() || null,
					templateId: taskType === 'cash_count' ? null : templateId,
					cashCountConfigId: taskType === 'cash_count' ? cashCountConfigId : null,
					triggerType: triggerType as RuleTriggerType,
					triggerConfig,
					conditions: Object.keys(conditions).length > 0 ? conditions : null,
					assignmentType: assignmentType as AssignmentType,
					assignmentConfig: Object.keys(assignmentConfig).length > 0 ? assignmentConfig : null,
					priority,
					isActive,
					updatedAt: new Date()
				})
				.where(eq(taskAssignmentRules.id, params.id));

			return { success: true, message: 'Rule updated successfully' };
		} catch (error) {
			log.error({ error, ruleId: params.id, name, templateId, cashCountConfigId }, 'Error updating rule');
			return fail(500, { error: 'Failed to update rule' });
		}
	},

	delete: async ({ locals, params }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		try {
			await db.delete(taskAssignmentRules).where(eq(taskAssignmentRules.id, params.id));
			throw redirect(302, '/admin/tasks/rules');
		} catch (error) {
			if (error instanceof Response) throw error;
			if (error && typeof error === 'object' && 'status' in error && 'location' in error) throw error;
			log.error({ error, ruleId: params.id }, 'Error deleting rule');
			return fail(500, { error: 'Failed to delete rule' });
		}
	}
};
