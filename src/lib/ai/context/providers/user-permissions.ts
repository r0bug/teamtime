// User Permissions Context Provider
// Pre-fetches and provides the current user's permissions in the context
// This eliminates the need for the AI to call get_my_permissions as a tool

import type { AIContextProvider } from '../../types';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserPermissions, type UserPermissions } from '$lib/server/auth/permissions';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:context:user-permissions');

// Stored user ID for context assembly (set before calling assembleContext)
let currentUserId: string | null = null;

export function setCurrentUserId(userId: string | null) {
	currentUserId = userId;
}

export function getCurrentUserId(): string | null {
	return currentUserId;
}

interface PermissionsContext {
	userId: string | null;
	userName: string | null;
	userRole: string | null;
	capabilities: {
		canViewSchedule: boolean;
		canCreateTasks: boolean;
		canAssignTasks: boolean;
		canCancelTasks: boolean;
		canManageShifts: boolean;
		canCreateSchedule: boolean;
		canSendMessages: boolean;
		canSendSMS: boolean;
		canManagePermissions: boolean;
		canViewAllUsers: boolean;
		canAccessAdmin: boolean;
	};
	allowedTools: string[];
	deniedTools: { tool: string; reason: string }[];
}

// Map user role to capability set
function getCapabilitiesForRole(role: string, permissions: UserPermissions | null): PermissionsContext['capabilities'] {
	const isAdmin = role === 'admin';
	const isManager = role === 'admin' || role === 'manager';

	const hasCustomPermission = (route: string, action?: string): boolean | null => {
		if (!permissions) return null;

		if (action) {
			if (permissions.deniedActions.get(route)?.has(action)) return false;
			if (permissions.grantedActions.get(route)?.has(action)) return true;
		} else {
			if (permissions.deniedRoutes.has(route)) return false;
			if (permissions.grantedRoutes.has(route)) return true;
		}
		return null;
	};

	return {
		canViewSchedule: true,
		canCreateTasks: hasCustomPermission('/tasks', 'create') ?? isManager,
		canAssignTasks: hasCustomPermission('/tasks', 'assign') ?? isManager,
		canCancelTasks: hasCustomPermission('/tasks', 'cancel') ?? isManager,
		canManageShifts: hasCustomPermission('/schedule', 'manage') ?? isManager,
		canCreateSchedule: hasCustomPermission('/schedule', 'create') ?? isManager,
		canSendMessages: true,
		canSendSMS: hasCustomPermission('/communications', 'sms') ?? isManager,
		canManagePermissions: hasCustomPermission('/admin/permissions') ?? isAdmin,
		canViewAllUsers: hasCustomPermission('/admin/users') ?? isManager,
		canAccessAdmin: hasCustomPermission('/admin') ?? isManager
	};
}

function getToolPermissionsFromCapabilities(capabilities: PermissionsContext['capabilities']) {
	const toolDefs = [
		{ tool: 'view_schedule', allowed: true },
		{ tool: 'get_available_staff', allowed: true },
		{ tool: 'review_past_chats', allowed: true },
		{ tool: 'get_chat_details', allowed: true },
		{ tool: 'list_grantable_user_types', allowed: capabilities.canAccessAdmin, reason: 'Requires manager role' },
		{ tool: 'list_grantable_permissions', allowed: capabilities.canAccessAdmin, reason: 'Requires manager role' },
		{ tool: 'create_task', allowed: capabilities.canCreateTasks, reason: 'Requires manager role' },
		{ tool: 'cancel_task', allowed: capabilities.canCancelTasks, reason: 'Requires manager role' },
		{ tool: 'create_recurring_task', allowed: capabilities.canCreateTasks, reason: 'Requires manager role' },
		{ tool: 'create_cash_count_task', allowed: capabilities.canCreateTasks, reason: 'Requires manager role' },
		{ tool: 'trade_shifts', allowed: capabilities.canManageShifts, reason: 'Requires manager role' },
		{ tool: 'create_schedule', allowed: capabilities.canCreateSchedule, reason: 'Requires manager role' },
		{ tool: 'send_message', allowed: true },
		{ tool: 'send_sms', allowed: capabilities.canSendSMS, reason: 'Requires manager role' },
		{ tool: 'view_user_permissions', allowed: capabilities.canAccessAdmin, reason: 'Requires manager role' },
		{ tool: 'grant_temporary_permission', allowed: capabilities.canManagePermissions, reason: 'Requires admin role' },
		{ tool: 'change_user_type_temporarily', allowed: capabilities.canManagePermissions, reason: 'Requires admin role' },
		{ tool: 'rollback_permission_change', allowed: capabilities.canManagePermissions, reason: 'Requires admin role' },
		{ tool: 'view_pending_approvals', allowed: capabilities.canAccessAdmin, reason: 'Requires manager role' },
		{ tool: 'process_inventory_photos', allowed: true },
		{ tool: 'continue_work', allowed: true }
	];

	const allowed = toolDefs.filter(t => t.allowed).map(t => t.tool);
	const denied = toolDefs.filter(t => !t.allowed).map(t => ({ tool: t.tool, reason: t.reason || 'Not permitted' }));

	return { allowed, denied };
}

export const userPermissionsProvider: AIContextProvider<PermissionsContext> = {
	moduleId: 'user_permissions',
	moduleName: 'User Permissions',
	description: 'Provides current user permissions and capabilities for the AI agent',
	priority: 0, // Highest priority - should be first in context
	agents: ['office_manager'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<PermissionsContext> {
		if (!currentUserId) {
			// No user context - return restricted permissions
			const capabilities = getCapabilitiesForRole('staff', null);
			const { allowed, denied } = getToolPermissionsFromCapabilities(capabilities);
			return {
				userId: null,
				userName: null,
				userRole: 'staff',
				capabilities,
				allowedTools: allowed,
				deniedTools: denied
			};
		}

		try {
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.id, currentUserId))
				.limit(1);

			if (!user) {
				const capabilities = getCapabilitiesForRole('staff', null);
				const { allowed, denied } = getToolPermissionsFromCapabilities(capabilities);
				return {
					userId: currentUserId,
					userName: null,
					userRole: 'staff',
					capabilities,
					allowedTools: allowed,
					deniedTools: denied
				};
			}

			const userPermissions = await getUserPermissions(user);
			const capabilities = getCapabilitiesForRole(user.role, userPermissions);
			const { allowed, denied } = getToolPermissionsFromCapabilities(capabilities);

			return {
				userId: user.id,
				userName: user.name,
				userRole: user.role,
				capabilities,
				allowedTools: allowed,
				deniedTools: denied
			};
		} catch (error) {
			log.error({ error }, 'Failed to load user permissions');
			const capabilities = getCapabilitiesForRole('staff', null);
			const { allowed, denied } = getToolPermissionsFromCapabilities(capabilities);
			return {
				userId: currentUserId,
				userName: null,
				userRole: 'staff',
				capabilities,
				allowedTools: allowed,
				deniedTools: denied
			};
		}
	},

	formatForPrompt(context: PermissionsContext): string {
		const lines: string[] = [];
		lines.push('## Your Permissions for This User');
		lines.push('');

		if (context.userName) {
			lines.push(`User: **${context.userName}** (Role: ${context.userRole})`);
		} else {
			lines.push(`User role: ${context.userRole} (restricted access)`);
		}
		lines.push('');

		lines.push('**ALLOWED Tools** (you may use these):');
		for (const tool of context.allowedTools) {
			lines.push(`- ${tool}`);
		}
		lines.push('');

		if (context.deniedTools.length > 0) {
			lines.push('**DENIED Tools** (DO NOT attempt these):');
			for (const { tool, reason } of context.deniedTools) {
				lines.push(`- ${tool} (${reason})`);
			}
			lines.push('');
		}

		lines.push('If the user asks for something using a denied tool, politely explain you cannot help with that and suggest they contact a manager.');

		return lines.join('\n');
	},

	estimateTokens(context: PermissionsContext): number {
		// Roughly estimate based on tool counts
		return 200 + context.allowedTools.length * 5 + context.deniedTools.length * 10;
	}
};
