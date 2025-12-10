// API endpoints for Office Manager permission management
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getUserPermissionSummary,
	grantTemporaryPermission,
	rollbackPermissionChange,
	approvePermissionChange,
	rejectPermissionChange,
	getPendingApprovals,
	getGrantableUserTypes,
	getGrantablePermissions,
	expireTemporaryPermissions
} from '$lib/server/services/permission-manager';

// GET /api/office-manager/permissions
// Query params: ?action=pending|user_types|permissions|summary&userId=xxx
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Only managers and admins can access permission management
	if (!['admin', 'manager'].includes(locals.user.role)) {
		throw error(403, 'Permission denied. Only managers and admins can manage permissions.');
	}

	const action = url.searchParams.get('action') || 'pending';
	const userId = url.searchParams.get('userId');

	try {
		switch (action) {
			case 'pending': {
				const pending = await getPendingApprovals();
				return json({ success: true, pending });
			}

			case 'user_types': {
				const userTypes = await getGrantableUserTypes();
				return json({ success: true, userTypes });
			}

			case 'permissions': {
				const permissions = await getGrantablePermissions();
				return json({ success: true, permissions });
			}

			case 'summary': {
				if (!userId) {
					throw error(400, 'userId is required for summary action');
				}
				const summary = await getUserPermissionSummary(userId);
				if (!summary) {
					throw error(404, 'User not found');
				}
				return json({ success: true, summary });
			}

			case 'expire': {
				// Run expiration check (for cron jobs or manual trigger)
				const count = await expireTemporaryPermissions();
				return json({ success: true, expiredCount: count });
			}

			default:
				throw error(400, `Unknown action: ${action}`);
		}
	} catch (err) {
		console.error('[API] GET /office-manager/permissions error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, err instanceof Error ? err.message : 'Internal error');
	}
};

// POST /api/office-manager/permissions
// Body: { action: 'grant' | 'user_type_change' | 'rollback' | 'approve' | 'reject', ...params }
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Only managers and admins can manage permissions
	if (!['admin', 'manager'].includes(locals.user.role)) {
		throw error(403, 'Permission denied. Only managers and admins can manage permissions.');
	}

	let body: {
		action: string;
		userId?: string;
		permissionId?: string;
		newUserTypeId?: string;
		durationHours?: number;
		justification?: string;
		changeId?: string;
		reason?: string;
	};

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { action } = body;

	try {
		switch (action) {
			case 'grant': {
				// Grant a temporary permission
				if (!body.userId || !body.permissionId || !body.durationHours || !body.justification) {
					throw error(400, 'userId, permissionId, durationHours, and justification are required');
				}

				const expiresAt = new Date();
				expiresAt.setHours(expiresAt.getHours() + body.durationHours);

				const result = await grantTemporaryPermission({
					userId: body.userId,
					changeType: 'permission_grant',
					permissionId: body.permissionId,
					expiresAt,
					justification: body.justification,
					grantedByUserId: locals.user.id
				});

				return json(result);
			}

			case 'user_type_change': {
				// Change user type temporarily
				if (!body.userId || !body.newUserTypeId || !body.durationHours || !body.justification) {
					throw error(400, 'userId, newUserTypeId, durationHours, and justification are required');
				}

				const expiresAt = new Date();
				expiresAt.setHours(expiresAt.getHours() + body.durationHours);

				const result = await grantTemporaryPermission({
					userId: body.userId,
					changeType: 'user_type_change',
					newUserTypeId: body.newUserTypeId,
					expiresAt,
					justification: body.justification,
					grantedByUserId: locals.user.id
				});

				return json(result);
			}

			case 'rollback': {
				// Rollback a permission change
				if (!body.changeId) {
					throw error(400, 'changeId is required');
				}

				const result = await rollbackPermissionChange(body.changeId, locals.user.id);
				return json(result);
			}

			case 'approve': {
				// Approve a pending permission change
				if (!body.changeId) {
					throw error(400, 'changeId is required');
				}

				const result = await approvePermissionChange(body.changeId, locals.user.id);
				return json(result);
			}

			case 'reject': {
				// Reject a pending permission change
				if (!body.changeId) {
					throw error(400, 'changeId is required');
				}

				const result = await rejectPermissionChange(body.changeId, locals.user.id, body.reason);
				return json(result);
			}

			default:
				throw error(400, `Unknown action: ${action}`);
		}
	} catch (err) {
		console.error('[API] POST /office-manager/permissions error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, err instanceof Error ? err.message : 'Internal error');
	}
};
