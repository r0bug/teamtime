// Get My Permissions Tool - Returns the current user's permissions to the AI
// This allows the Office Manager to understand what the user can/cannot do
// and respond appropriately without attempting unauthorized actions

import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserPermissions, type UserPermissions } from '$lib/server/auth/permissions';
import type { AITool, ToolExecutionContext } from '../../types';
import type { User } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:get-my-permissions');

interface GetMyPermissionsParams {
	// No params needed - uses the context userId
}

interface ToolPermission {
	tool: string;
	allowed: boolean;
	reason?: string;
}

interface GetMyPermissionsResult {
	success: boolean;
	userId?: string;
	userName?: string;
	userRole?: string;
	userTypeName?: string;

	// High-level capability flags
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

	// Tool-specific permissions with explanations
	toolPermissions: ToolPermission[];

	// Summary for AI prompt
	summary: string;

	error?: string;
}

// Map user role to capability set
function getCapabilitiesForRole(role: string, permissions: UserPermissions | null): GetMyPermissionsResult['capabilities'] {
	const isAdmin = role === 'admin';
	const isManager = role === 'admin' || role === 'manager';
	const isPurchaser = isManager || role === 'purchaser';

	// Check for custom permissions that might override role defaults
	const hasCustomPermission = (route: string, action?: string): boolean | null => {
		if (!permissions) return null;

		if (action) {
			if (permissions.deniedActions.get(route)?.has(action)) return false;
			if (permissions.grantedActions.get(route)?.has(action)) return true;
		} else {
			if (permissions.deniedRoutes.has(route)) return false;
			if (permissions.grantedRoutes.has(route)) return true;
		}
		return null; // No custom permission, use role default
	};

	return {
		// Read operations - available to all users
		canViewSchedule: true,

		// Task operations
		canCreateTasks: hasCustomPermission('/tasks', 'create') ?? isManager,
		canAssignTasks: hasCustomPermission('/tasks', 'assign') ?? isManager,
		canCancelTasks: hasCustomPermission('/tasks', 'cancel') ?? isManager,

		// Schedule operations
		canManageShifts: hasCustomPermission('/schedule', 'manage') ?? isManager,
		canCreateSchedule: hasCustomPermission('/schedule', 'create') ?? isManager,

		// Communication
		canSendMessages: true, // All users can send messages
		canSendSMS: hasCustomPermission('/communications', 'sms') ?? isManager,

		// Admin operations
		canManagePermissions: hasCustomPermission('/admin/permissions') ?? isAdmin,
		canViewAllUsers: hasCustomPermission('/admin/users') ?? isManager,
		canAccessAdmin: hasCustomPermission('/admin') ?? isManager
	};
}

// Generate tool permissions based on capabilities
function getToolPermissions(capabilities: GetMyPermissionsResult['capabilities']): ToolPermission[] {
	return [
		// Read-only tools - always allowed
		{
			tool: 'view_schedule',
			allowed: true,
			reason: 'All users can view the schedule'
		},
		{
			tool: 'get_available_staff',
			allowed: true,
			reason: 'All users can check staff availability'
		},
		{
			tool: 'review_past_chats',
			allowed: true,
			reason: 'Users can review their own chat history'
		},
		{
			tool: 'get_chat_details',
			allowed: true,
			reason: 'Users can view their own past conversations'
		},
		{
			tool: 'list_grantable_user_types',
			allowed: capabilities.canAccessAdmin,
			reason: capabilities.canAccessAdmin ? 'Manager access' : 'Requires manager or admin role'
		},
		{
			tool: 'list_grantable_permissions',
			allowed: capabilities.canAccessAdmin,
			reason: capabilities.canAccessAdmin ? 'Manager access' : 'Requires manager or admin role'
		},

		// Task tools
		{
			tool: 'create_task',
			allowed: capabilities.canCreateTasks,
			reason: capabilities.canCreateTasks ? 'Task creation permitted' : 'Requires manager role or task creation permission'
		},
		{
			tool: 'cancel_task',
			allowed: capabilities.canCancelTasks,
			reason: capabilities.canCancelTasks ? 'Task cancellation permitted' : 'Requires manager role or task management permission'
		},
		{
			tool: 'create_recurring_task',
			allowed: capabilities.canCreateTasks,
			reason: capabilities.canCreateTasks ? 'Task creation permitted' : 'Requires manager role or task creation permission'
		},
		{
			tool: 'create_cash_count_task',
			allowed: capabilities.canCreateTasks,
			reason: capabilities.canCreateTasks ? 'Task creation permitted' : 'Requires manager role or task creation permission'
		},

		// Schedule tools
		{
			tool: 'trade_shifts',
			allowed: capabilities.canManageShifts,
			reason: capabilities.canManageShifts ? 'Shift management permitted' : 'Requires manager role or shift management permission'
		},
		{
			tool: 'create_schedule',
			allowed: capabilities.canCreateSchedule,
			reason: capabilities.canCreateSchedule ? 'Schedule creation permitted' : 'Requires manager role or schedule management permission'
		},

		// Communication tools
		{
			tool: 'send_message',
			allowed: capabilities.canSendMessages,
			reason: 'All users can send messages'
		},
		{
			tool: 'send_sms',
			allowed: capabilities.canSendSMS,
			reason: capabilities.canSendSMS ? 'SMS sending permitted' : 'Requires manager role or SMS permission'
		},

		// Permission tools
		{
			tool: 'view_user_permissions',
			allowed: capabilities.canAccessAdmin,
			reason: capabilities.canAccessAdmin ? 'Manager access' : 'Requires manager or admin role'
		},
		{
			tool: 'grant_temporary_permission',
			allowed: capabilities.canManagePermissions,
			reason: capabilities.canManagePermissions ? 'Permission management permitted' : 'Requires admin role'
		},
		{
			tool: 'change_user_type_temporarily',
			allowed: capabilities.canManagePermissions,
			reason: capabilities.canManagePermissions ? 'Permission management permitted' : 'Requires admin role'
		},
		{
			tool: 'rollback_permission_change',
			allowed: capabilities.canManagePermissions,
			reason: capabilities.canManagePermissions ? 'Permission management permitted' : 'Requires admin role'
		},
		{
			tool: 'view_pending_approvals',
			allowed: capabilities.canAccessAdmin,
			reason: capabilities.canAccessAdmin ? 'Manager access' : 'Requires manager or admin role'
		},

		// Inventory tools
		{
			tool: 'process_inventory_photos',
			allowed: true, // All staff can process inventory
			reason: 'All staff can process inventory'
		},

		// Internal tools
		{
			tool: 'continue_work',
			allowed: true,
			reason: 'Internal AI tool'
		}
	];
}

// Generate a summary for the AI
function generateSummary(
	userName: string,
	role: string,
	capabilities: GetMyPermissionsResult['capabilities'],
	toolPermissions: ToolPermission[]
): string {
	const allowedTools = toolPermissions.filter(t => t.allowed).map(t => t.tool);
	const deniedTools = toolPermissions.filter(t => !t.allowed).map(t => t.tool);

	let summary = `User ${userName} has role "${role}".\n\n`;

	summary += `ALLOWED actions:\n`;
	if (capabilities.canViewSchedule) summary += `- View schedules and staff availability\n`;
	if (capabilities.canSendMessages) summary += `- Send messages to other users\n`;
	if (capabilities.canCreateTasks) summary += `- Create and assign tasks\n`;
	if (capabilities.canCancelTasks) summary += `- Cancel tasks\n`;
	if (capabilities.canManageShifts) summary += `- Trade and reassign shifts\n`;
	if (capabilities.canCreateSchedule) summary += `- Create weekly schedules\n`;
	if (capabilities.canSendSMS) summary += `- Send SMS notifications\n`;
	if (capabilities.canManagePermissions) summary += `- Manage user permissions\n`;
	if (capabilities.canAccessAdmin) summary += `- Access admin features\n`;

	if (deniedTools.length > 0) {
		summary += `\nNOT ALLOWED (do not attempt these):\n`;
		for (const tool of deniedTools) {
			const perm = toolPermissions.find(t => t.tool === tool);
			summary += `- ${tool}: ${perm?.reason}\n`;
		}
	}

	summary += `\nIMPORTANT: Before using any tool, verify it is in the ALLOWED list above. `;
	summary += `If a user requests something you cannot do, politely explain you don't have permission and suggest they contact a manager.`;

	return summary;
}

export const getMyPermissionsTool: AITool<GetMyPermissionsParams, GetMyPermissionsResult> = {
	name: 'get_my_permissions',
	description: 'Get the current user\'s permissions and capabilities. Call this FIRST at the start of every conversation to understand what actions you are allowed to take on behalf of this user. This returns the user\'s role, capabilities, and which tools you can use.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate() {
		return { valid: true };
	},

	async execute(_params: GetMyPermissionsParams, context: ToolExecutionContext): Promise<GetMyPermissionsResult> {
		try {
			// Get user ID from context
			const userId = context.userId;

			if (!userId) {
				// If no user context, return restricted permissions
				log.warn('get_my_permissions called without user context');
				const restrictedCapabilities = getCapabilitiesForRole('staff', null);
				const toolPermissions = getToolPermissions(restrictedCapabilities);

				return {
					success: true,
					capabilities: restrictedCapabilities,
					toolPermissions,
					summary: 'No user context available. Operating with restricted (staff-level) permissions. Only read-only operations are allowed.'
				};
			}

			// Get user from database
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			if (!user) {
				return {
					success: false,
					capabilities: getCapabilitiesForRole('staff', null),
					toolPermissions: [],
					summary: 'User not found',
					error: 'User not found'
				};
			}

			// Get user's granular permissions
			const userPermissions = await getUserPermissions(user);

			// Build capabilities based on role and permissions
			const capabilities = getCapabilitiesForRole(user.role, userPermissions);
			const toolPermissions = getToolPermissions(capabilities);
			const summary = generateSummary(user.name, user.role, capabilities, toolPermissions);

			return {
				success: true,
				userId: user.id,
				userName: user.name,
				userRole: user.role,
				userTypeName: userPermissions.userTypeName || undefined,
				capabilities,
				toolPermissions,
				summary
			};
		} catch (error) {
			log.error({ error }, 'get_my_permissions tool error');
			return {
				success: false,
				capabilities: getCapabilitiesForRole('staff', null),
				toolPermissions: [],
				summary: 'Error checking permissions',
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: GetMyPermissionsResult): string {
		if (!result.success) {
			return `Failed to get permissions: ${result.error}`;
		}
		return result.summary;
	}
};
