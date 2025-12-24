import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { visibilityService } from '$lib/server/services/visibility-service';
import { db, users, visibilityGroups, visibilityGroupMembers } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
		throw redirect(302, '/dashboard');
	}

	// Get all data for the visibility settings page
	const [rules, groups, presets, allUsers] = await Promise.all([
		visibilityService.getAllRules(),
		visibilityService.getAllGroups(),
		visibilityService.getPresets(),
		db.select({
			id: users.id,
			name: users.name,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name)
	]);

	// Get members for each group
	const groupsWithMembers = await Promise.all(
		groups.map(async (group) => {
			const members = await visibilityService.getGroupMembers(group.id);
			return {
				...group,
				members
			};
		})
	);

	// Organize rules by category
	const rulesByCategory: Record<string, typeof rules> = {};
	for (const rule of rules) {
		if (!rulesByCategory[rule.category]) {
			rulesByCategory[rule.category] = [];
		}
		rulesByCategory[rule.category].push(rule);
	}

	return {
		rules,
		rulesByCategory,
		groups: groupsWithMembers,
		presets,
		allUsers
	};
};

export const actions: Actions = {
	// Toggle a visibility rule
	toggleRule: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const ruleKey = formData.get('ruleKey') as string;
		const isEnabled = formData.get('isEnabled') === 'true';

		try {
			await visibilityService.updateRule(ruleKey, isEnabled);
			return { success: true };
		} catch (e) {
			return fail(500, { error: 'Failed to update rule' });
		}
	},

	// Apply a preset
	applyPreset: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const presetId = formData.get('presetId') as string;

		try {
			await visibilityService.applyPreset(presetId);
			return { success: true, message: 'Preset applied successfully' };
		} catch (e) {
			return fail(500, { error: 'Failed to apply preset' });
		}
	},

	// Create a new group
	createGroup: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const groupType = formData.get('groupType') as 'team' | 'store' | 'department' | 'custom';
		const description = formData.get('description') as string | null;
		const memberIds = formData.getAll('memberIds') as string[];

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		try {
			await visibilityService.createGroup(name, groupType, memberIds, description || undefined);
			return { success: true, message: 'Group created successfully' };
		} catch (e) {
			return fail(500, { error: 'Failed to create group' });
		}
	},

	// Add user to group
	addUserToGroup: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const groupId = formData.get('groupId') as string;
		const isLeader = formData.get('isLeader') === 'true';

		try {
			await visibilityService.addUserToGroup(userId, groupId, isLeader);
			return { success: true };
		} catch (e) {
			return fail(500, { error: 'Failed to add user to group' });
		}
	},

	// Remove user from group
	removeUserFromGroup: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const groupId = formData.get('groupId') as string;

		try {
			await visibilityService.removeUserFromGroup(userId, groupId);
			return { success: true };
		} catch (e) {
			return fail(500, { error: 'Failed to remove user from group' });
		}
	},

	// Grant visibility to a user
	grantVisibility: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const dataCategory = formData.get('dataCategory') as 'tasks' | 'messages' | 'schedule' | 'attendance' | 'users';
		const targetUserId = formData.get('targetUserId') as string | null;
		const targetGroupId = formData.get('targetGroupId') as string | null;
		const targetRole = formData.get('targetRole') as string | null;
		const reason = formData.get('reason') as string | null;

		if (!userId || !dataCategory) {
			return fail(400, { error: 'User and category are required' });
		}

		if (!targetUserId && !targetGroupId && !targetRole) {
			return fail(400, { error: 'Must specify a target user, group, or role' });
		}

		try {
			await visibilityService.grantUserVisibility({
				userId,
				dataCategory,
				targetUserId: targetUserId || undefined,
				targetGroupId: targetGroupId || undefined,
				targetRole: targetRole as 'admin' | 'manager' | 'purchaser' | 'staff' | undefined,
				grantedByUserId: locals.user.id,
				reason: reason || undefined
			});
			return { success: true, message: 'Visibility granted successfully' };
		} catch (e) {
			return fail(500, { error: 'Failed to grant visibility' });
		}
	},

	// Revoke a grant
	revokeGrant: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const grantId = formData.get('grantId') as string;

		try {
			await visibilityService.revokeGrant(grantId);
			return { success: true };
		} catch (e) {
			return fail(500, { error: 'Failed to revoke grant' });
		}
	}
};
