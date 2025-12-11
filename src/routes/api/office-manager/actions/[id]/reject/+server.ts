// Office Manager Action Reject API - Reject pending actions
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPendingAction,
	rejectPendingAction,
	getChatSessionForUser,
	addAssistantMessage
} from '$lib/ai/office-manager/chat';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:office-manager:actions:reject');

// POST - Reject a pending action
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

		// Reject the action
		await rejectPendingAction(params.id);

		// Add a system message to the chat
		const message = `Action "${action.toolName}" was rejected.`;
		await addAssistantMessage(action.chatId, message);

		return json({
			success: true,
			message
		});
	} catch (error) {
		log.error({ error, actionId: params.id, userId: locals.user?.id }, 'Reject error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
