import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, taskAssignmentRules, taskTemplates, locations, cashCountConfigs } from '$lib/server/db';
import { eq, desc, sql } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:tasks:rules');

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const templateIdFilter = url.searchParams.get('templateId');

	// Build the query - LEFT JOIN both templates and cash count configs
	let query = db
		.select({
			id: taskAssignmentRules.id,
			name: taskAssignmentRules.name,
			description: taskAssignmentRules.description,
			triggerType: taskAssignmentRules.triggerType,
			triggerConfig: taskAssignmentRules.triggerConfig,
			assignmentType: taskAssignmentRules.assignmentType,
			conditions: taskAssignmentRules.conditions,
			priority: taskAssignmentRules.priority,
			isActive: taskAssignmentRules.isActive,
			triggerCount: taskAssignmentRules.triggerCount,
			lastTriggeredAt: taskAssignmentRules.lastTriggeredAt,
			templateId: taskAssignmentRules.templateId,
			templateName: taskTemplates.name,
			cashCountConfigId: taskAssignmentRules.cashCountConfigId,
			cashCountConfigName: cashCountConfigs.name,
			createdAt: taskAssignmentRules.createdAt
		})
		.from(taskAssignmentRules)
		.leftJoin(taskTemplates, eq(taskAssignmentRules.templateId, taskTemplates.id))
		.leftJoin(cashCountConfigs, eq(taskAssignmentRules.cashCountConfigId, cashCountConfigs.id))
		.orderBy(desc(taskAssignmentRules.priority), desc(taskAssignmentRules.createdAt));

	// Apply filter if provided
	const rules = templateIdFilter
		? await query.where(eq(taskAssignmentRules.templateId, templateIdFilter))
		: await query;

	// Get templates for filter dropdown
	const templates = await db
		.select({
			id: taskTemplates.id,
			name: taskTemplates.name
		})
		.from(taskTemplates)
		.where(eq(taskTemplates.isActive, true))
		.orderBy(taskTemplates.name);

	// Get selected template name if filtering
	let filterTemplateName = null;
	if (templateIdFilter) {
		const template = templates.find((t) => t.id === templateIdFilter);
		filterTemplateName = template?.name || 'Unknown Template';
	}

	return {
		rules,
		templates,
		filterTemplateId: templateIdFilter,
		filterTemplateName
	};
};

export const actions: Actions = {
	toggleActive: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const ruleId = formData.get('ruleId') as string;
		const isActive = formData.get('isActive') === 'true';

		if (!ruleId) {
			return fail(400, { error: 'Rule ID is required' });
		}

		try {
			await db
				.update(taskAssignmentRules)
				.set({
					isActive,
					updatedAt: new Date()
				})
				.where(eq(taskAssignmentRules.id, ruleId));

			return { success: true, message: `Rule ${isActive ? 'activated' : 'deactivated'}` };
		} catch (error) {
			log.error('Error toggling rule', { error, ruleId, isActive });
			return fail(500, { error: 'Failed to update rule' });
		}
	},

	delete: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const ruleId = formData.get('ruleId') as string;

		if (!ruleId) {
			return fail(400, { error: 'Rule ID is required' });
		}

		try {
			await db.delete(taskAssignmentRules).where(eq(taskAssignmentRules.id, ruleId));
			return { success: true, message: 'Rule deleted' };
		} catch (error) {
			log.error('Error deleting rule', { error, ruleId });
			return fail(500, { error: 'Failed to delete rule' });
		}
	}
};
