// Office Manager Action Confirm API - Approve pending actions
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPendingAction,
	approvePendingAction,
	getChatSessionForUser,
	executeConfirmedAction,
	addAssistantMessage
} from '$lib/ai/office-manager/chat';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:office-manager:actions:confirm');

// POST - Confirm/approve a pending action
export const POST: RequestHandler = async ({ locals, params }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// Get the pending action
		const action = await getPendingAction(params.id);
		if (!action) {
			return json({ success: false, error: 'Action not found' }, { status: 404 });
		}

		// Verify user owns the chat - user is guaranteed to exist after isManager check
		const session = await getChatSessionForUser(action.chatId, locals.user!.id);
		if (!session) {
			return json({ success: false, error: 'Unauthorized' }, { status: 403 });
		}

		// Check if action is still pending
		if (action.status !== 'pending') {
			return json({
				success: false,
				error: `Action already ${action.status}`
			}, { status: 400 });
		}

		// Check if action has expired
		if (new Date() > action.expiresAt) {
			return json({
				success: false,
				error: 'Action has expired'
			}, { status: 400 });
		}

		// Execute the action
		const { success, result } = await executeConfirmedAction(params.id, action);

		// Update the pending action status
		await approvePendingAction(params.id, result as Record<string, unknown>);

		// Add a system message to the chat about the action result
		const resultMessage = success
			? `Action "${action.toolName}" executed successfully.`
			: `Action "${action.toolName}" failed: ${(result as { error?: string }).error || 'Unknown error'}`;

		await addAssistantMessage(action.chatId, resultMessage, [{
			name: action.toolName,
			params: action.toolArgs,
			result
		}]);

		return json({
			success,
			result,
			message: resultMessage
		});
	} catch (error) {
		log.error({ error, actionId: params.id, userId: locals.user?.id }, 'Confirm error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
