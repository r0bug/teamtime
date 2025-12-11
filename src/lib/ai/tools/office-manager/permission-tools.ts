// Permission Management Tools - Allows Office Manager AI to manage user permissions
// with safety constraints, audit logging, and approval workflows

import {
	getUserPermissionSummary,
	grantTemporaryPermission,
	rollbackPermissionChange,
	getPendingApprovals,
	getGrantableUserTypes,
	getGrantablePermissions,
	canModifyUser
} from '$lib/server/services/permission-manager';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:permission-tools');

// ============================================================================
// Tool 1: View User Permissions
// ============================================================================

interface ViewPermissionsParams {
	userId: string;
}

interface ViewPermissionsResult {
	success: boolean;
	summary?: {
		userId: string;
		userName: string;
		userRole: string;
		userTypeName?: string;
		temporaryPermissions: {
			changeType: string;
			permissionName?: string;
			userTypeName?: string;
			expiresAt: string | null;
			justification: string;
		}[];
		pendingApprovals: number;
	};
	error?: string;
}

export const viewUserPermissionsTool: AITool<ViewPermissionsParams, ViewPermissionsResult> = {
	name: 'view_user_permissions',
	description: 'View a user\'s current permissions, user type, and any active temporary permission changes. Use this to understand what access a user currently has before making changes.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The ID of the user to view permissions for'
			}
		},
		required: ['userId']
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ViewPermissionsParams) {
		if (!params.userId) {
			return { valid: false, error: 'User ID is required' };
		}
		return { valid: true };
	},

	async execute(params: ViewPermissionsParams): Promise<ViewPermissionsResult> {
		try {
			const summary = await getUserPermissionSummary(params.userId);
			if (!summary) {
				return { success: false, error: 'User not found' };
			}

			return {
				success: true,
				summary: {
					userId: summary.userId,
					userName: summary.userName,
					userRole: summary.userRole,
					userTypeName: summary.userTypeName,
					temporaryPermissions: summary.temporaryPermissions.map(tp => ({
						changeType: tp.changeType,
						permissionName: tp.permissionName,
						userTypeName: tp.userTypeName,
						expiresAt: tp.expiresAt?.toISOString() || null,
						justification: tp.justification
					})),
					pendingApprovals: summary.pendingApprovals
				}
			};
		} catch (error) {
			log.error('View user permissions tool error', { error });
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: ViewPermissionsResult): string {
		if (!result.success || !result.summary) {
			return `Failed to view permissions: ${result.error}`;
		}
		const s = result.summary;
		let msg = `Permissions for ${s.userName} (${s.userRole})`;
		if (s.userTypeName) msg += ` - User Type: ${s.userTypeName}`;
		if (s.temporaryPermissions.length > 0) {
			msg += `\nActive temporary changes: ${s.temporaryPermissions.length}`;
			for (const tp of s.temporaryPermissions) {
				msg += `\n  - ${tp.changeType}`;
				if (tp.permissionName) msg += `: ${tp.permissionName}`;
				if (tp.userTypeName) msg += `: ${tp.userTypeName}`;
				if (tp.expiresAt) msg += ` (expires ${tp.expiresAt})`;
			}
		}
		if (s.pendingApprovals > 0) {
			msg += `\n${s.pendingApprovals} pending approval(s)`;
		}
		return msg;
	}
};

// ============================================================================
// Tool 2: Grant Temporary Permission
// ============================================================================

interface GrantPermissionParams {
	userId: string;
	permissionId: string;
	durationHours: number;
	justification: string;
}

interface GrantPermissionResult {
	success: boolean;
	changeId?: string;
	requiresApproval?: boolean;
	error?: string;
}

export const grantTemporaryPermissionTool: AITool<GrantPermissionParams, GrantPermissionResult> = {
	name: 'grant_temporary_permission',
	description: 'Grant a specific permission to a user temporarily. The permission will automatically expire after the specified duration. Requires a justification explaining why the permission is needed. Sensitive permissions (admin, security modules) require human approval.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The ID of the user to grant permission to'
			},
			permissionId: {
				type: 'string',
				description: 'The ID of the permission to grant'
			},
			durationHours: {
				type: 'number',
				description: 'How long the permission should last in hours (max 168 = 1 week)'
			},
			justification: {
				type: 'string',
				description: 'Explanation of why this permission is needed (min 10 chars)'
			}
		},
		required: ['userId', 'permissionId', 'durationHours', 'justification']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		perUser: 30 // Don't change same user's permissions more than once per 30 min
	},

	getConfirmationMessage(params: GrantPermissionParams): string {
		return `Grant permission ${params.permissionId} to user for ${params.durationHours} hours. Reason: ${params.justification}`;
	},

	validate(params: GrantPermissionParams) {
		if (!params.userId) return { valid: false, error: 'User ID is required' };
		if (!params.permissionId) return { valid: false, error: 'Permission ID is required' };
		if (!params.durationHours || params.durationHours < 1) return { valid: false, error: 'Duration must be at least 1 hour' };
		if (params.durationHours > 168) return { valid: false, error: 'Maximum duration is 168 hours (1 week)' };
		if (!params.justification || params.justification.length < 10) return { valid: false, error: 'Justification must be at least 10 characters' };
		return { valid: true };
	},

	async execute(params: GrantPermissionParams, context: ToolExecutionContext): Promise<GrantPermissionResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run - permission would be granted' };
		}

		try {
			// Check if user can be modified
			const canModify = await canModifyUser(params.userId);
			if (!canModify.allowed) {
				return { success: false, error: canModify.reason };
			}

			const expiresAt = new Date();
			expiresAt.setHours(expiresAt.getHours() + params.durationHours);

			const result = await grantTemporaryPermission({
				userId: params.userId,
				changeType: 'permission_grant',
				permissionId: params.permissionId,
				expiresAt,
				justification: params.justification,
				grantedByAiRunId: context.runId
			});

			return result;
		} catch (error) {
			log.error('Grant temporary permission tool error', { error });
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: GrantPermissionResult): string {
		if (result.success) {
			if (result.requiresApproval) {
				return `Permission change submitted for approval (ID: ${result.changeId}). A manager must approve before it takes effect.`;
			}
			return `Permission granted successfully (ID: ${result.changeId})`;
		}
		return `Failed to grant permission: ${result.error}`;
	}
};

// ============================================================================
// Tool 3: Change User Type Temporarily
// ============================================================================

interface ChangeUserTypeParams {
	userId: string;
	newUserTypeId: string;
	durationHours: number;
	justification: string;
}

interface ChangeUserTypeResult {
	success: boolean;
	changeId?: string;
	requiresApproval?: boolean;
	previousUserTypeName?: string;
	newUserTypeName?: string;
	error?: string;
}

export const changeUserTypeTool: AITool<ChangeUserTypeParams, ChangeUserTypeResult> = {
	name: 'change_user_type_temporarily',
	description: 'Temporarily change a user\'s user type, which affects all their permissions. Use this for role adjustments like temporarily promoting someone to a higher access level. Cannot be used to grant Admin user type. Manager promotions require human approval.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The ID of the user to change'
			},
			newUserTypeId: {
				type: 'string',
				description: 'The ID of the user type to assign'
			},
			durationHours: {
				type: 'number',
				description: 'How long the change should last in hours (max 168 = 1 week)'
			},
			justification: {
				type: 'string',
				description: 'Explanation of why this change is needed (min 10 chars)'
			}
		},
		required: ['userId', 'newUserTypeId', 'durationHours', 'justification']
	},

	requiresApproval: false,
	requiresConfirmation: true,
	cooldown: {
		perUser: 60 // Don't change same user's type more than once per hour
	},

	getConfirmationMessage(params: ChangeUserTypeParams): string {
		return `Change user type to ${params.newUserTypeId} for ${params.durationHours} hours. Reason: ${params.justification}`;
	},

	validate(params: ChangeUserTypeParams) {
		if (!params.userId) return { valid: false, error: 'User ID is required' };
		if (!params.newUserTypeId) return { valid: false, error: 'New user type ID is required' };
		if (!params.durationHours || params.durationHours < 1) return { valid: false, error: 'Duration must be at least 1 hour' };
		if (params.durationHours > 168) return { valid: false, error: 'Maximum duration is 168 hours (1 week)' };
		if (!params.justification || params.justification.length < 10) return { valid: false, error: 'Justification must be at least 10 characters' };
		return { valid: true };
	},

	async execute(params: ChangeUserTypeParams, context: ToolExecutionContext): Promise<ChangeUserTypeResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run - user type would be changed' };
		}

		try {
			const canModify = await canModifyUser(params.userId);
			if (!canModify.allowed) {
				return { success: false, error: canModify.reason };
			}

			const expiresAt = new Date();
			expiresAt.setHours(expiresAt.getHours() + params.durationHours);

			const result = await grantTemporaryPermission({
				userId: params.userId,
				changeType: 'user_type_change',
				newUserTypeId: params.newUserTypeId,
				expiresAt,
				justification: params.justification,
				grantedByAiRunId: context.runId
			});

			return {
				...result
			};
		} catch (error) {
			log.error('Change user type temporarily tool error', { error });
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: ChangeUserTypeResult): string {
		if (result.success) {
			if (result.requiresApproval) {
				return `User type change submitted for approval (ID: ${result.changeId}). A manager must approve before it takes effect.`;
			}
			return `User type changed successfully (ID: ${result.changeId})`;
		}
		return `Failed to change user type: ${result.error}`;
	}
};

// ============================================================================
// Tool 4: Rollback Permission Change
// ============================================================================

interface RollbackParams {
	changeId: string;
}

interface RollbackResult {
	success: boolean;
	error?: string;
}

export const rollbackPermissionChangeTool: AITool<RollbackParams, RollbackResult> = {
	name: 'rollback_permission_change',
	description: 'Rollback a previous temporary permission change. Use this if a permission grant or user type change needs to be reverted immediately (before natural expiration).',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			changeId: {
				type: 'string',
				description: 'The ID of the permission change to rollback'
			}
		},
		required: ['changeId']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	getConfirmationMessage(params: RollbackParams): string {
		return `Rollback permission change ${params.changeId}`;
	},

	validate(params: RollbackParams) {
		if (!params.changeId) return { valid: false, error: 'Change ID is required' };
		return { valid: true };
	},

	async execute(params: RollbackParams, context: ToolExecutionContext): Promise<RollbackResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run - change would be rolled back' };
		}

		try {
			const result = await rollbackPermissionChange(params.changeId);
			return result;
		} catch (error) {
			log.error('Rollback permission change tool error', { error });
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: RollbackResult): string {
		if (result.success) {
			return 'Permission change rolled back successfully';
		}
		return `Failed to rollback: ${result.error}`;
	}
};

// ============================================================================
// Tool 5: List Available User Types
// ============================================================================

interface ListUserTypesParams {
	// No params needed
}

interface ListUserTypesResult {
	success: boolean;
	userTypes?: { id: string; name: string; description?: string; basedOnRole?: string }[];
	error?: string;
}

export const listGrantableUserTypesTool: AITool<ListUserTypesParams, ListUserTypesResult> = {
	name: 'list_grantable_user_types',
	description: 'List all user types that can be granted to users. Use this to see available options before changing a user\'s type.',
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

	async execute(): Promise<ListUserTypesResult> {
		try {
			const types = await getGrantableUserTypes();
			return { success: true, userTypes: types };
		} catch (error) {
			log.error('List grantable user types tool error', { error });
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: ListUserTypesResult): string {
		if (!result.success || !result.userTypes) {
			return `Failed to list user types: ${result.error}`;
		}
		let msg = 'Available user types:\n';
		for (const ut of result.userTypes) {
			msg += `- ${ut.name} (${ut.id})`;
			if (ut.basedOnRole) msg += ` [based on ${ut.basedOnRole}]`;
			if (ut.description) msg += `: ${ut.description}`;
			msg += '\n';
		}
		return msg;
	}
};

// ============================================================================
// Tool 6: List Available Permissions
// ============================================================================

interface ListPermissionsParams {
	module?: string;
}

interface ListPermissionsResult {
	success: boolean;
	permissions?: { id: string; name: string; module: string; description?: string }[];
	error?: string;
}

export const listGrantablePermissionsTool: AITool<ListPermissionsParams, ListPermissionsResult> = {
	name: 'list_grantable_permissions',
	description: 'List permissions that can be granted to users. Optionally filter by module. Use this to see available permissions before granting one.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			module: {
				type: 'string',
				description: 'Optional: filter by module name (e.g., "tasks", "pricing")'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate() {
		return { valid: true };
	},

	async execute(params: ListPermissionsParams): Promise<ListPermissionsResult> {
		try {
			let perms = await getGrantablePermissions();
			if (params.module) {
				perms = perms.filter(p => p.module === params.module);
			}
			return { success: true, permissions: perms };
		} catch (error) {
			log.error('List grantable permissions tool error', { error });
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: ListPermissionsResult): string {
		if (!result.success || !result.permissions) {
			return `Failed to list permissions: ${result.error}`;
		}
		if (result.permissions.length === 0) {
			return 'No grantable permissions found';
		}
		let msg = `Available permissions (${result.permissions.length}):\n`;
		const byModule: Record<string, typeof result.permissions> = {};
		for (const p of result.permissions) {
			if (!byModule[p.module]) byModule[p.module] = [];
			byModule[p.module].push(p);
		}
		for (const [module, perms] of Object.entries(byModule)) {
			msg += `\n[${module}]\n`;
			for (const p of perms) {
				msg += `  - ${p.name} (${p.id})`;
				if (p.description) msg += `: ${p.description}`;
				msg += '\n';
			}
		}
		return msg;
	}
};

// ============================================================================
// Tool 7: View Pending Approvals
// ============================================================================

interface ViewPendingParams {
	// No params needed
}

interface ViewPendingResult {
	success: boolean;
	pending?: {
		id: string;
		userName: string;
		changeType: string;
		detail: string;
		justification: string;
	}[];
	error?: string;
}

export const viewPendingApprovalsTool: AITool<ViewPendingParams, ViewPendingResult> = {
	name: 'view_pending_approvals',
	description: 'View all permission changes that are waiting for manager approval. Use this to check if any of your previous changes need human approval.',
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

	async execute(): Promise<ViewPendingResult> {
		try {
			const pending = await getPendingApprovals();
			return {
				success: true,
				pending: pending.map(p => ({
					id: p.id,
					userName: p.userName,
					changeType: p.changeType,
					detail: p.permissionName || p.userTypeName || 'N/A',
					justification: p.justification
				}))
			};
		} catch (error) {
			log.error('View pending approvals tool error', { error });
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: ViewPendingResult): string {
		if (!result.success || !result.pending) {
			return `Failed to get pending approvals: ${result.error}`;
		}
		if (result.pending.length === 0) {
			return 'No pending approvals';
		}
		let msg = `Pending approvals (${result.pending.length}):\n`;
		for (const p of result.pending) {
			msg += `- [${p.id}] ${p.userName}: ${p.changeType} - ${p.detail}\n`;
			msg += `  Reason: ${p.justification}\n`;
		}
		return msg;
	}
};

// Export all permission tools
export const permissionTools = [
	viewUserPermissionsTool,
	grantTemporaryPermissionTool,
	changeUserTypeTool,
	rollbackPermissionChangeTool,
	listGrantableUserTypesTool,
	listGrantablePermissionsTool,
	viewPendingApprovalsTool
];
