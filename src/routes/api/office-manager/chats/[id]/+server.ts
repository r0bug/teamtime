// Office Manager Chat Session API - Get and delete specific chat
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChatSessionForUser, deleteChatSession, getPendingActionsForChat } from '$lib/ai/office-manager/chat';
import { isManager } from '$lib/server/auth/roles';

// GET - Get a specific chat session with messages and pending actions
export const GET: RequestHandler = async ({ locals, params }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// User is guaranteed to exist after isManager check
		const session = await getChatSessionForUser(params.id, locals.user!.id);
		if (!session) {
			return json({ success: false, error: 'Chat not found' }, { status: 404 });
		}

		// Get pending actions for this chat
		const pendingActions = await getPendingActionsForChat(params.id);

		return json({
			success: true,
			session: {
				id: session.id,
				title: session.title,
				messages: session.messages,
				createdAt: session.createdAt.toISOString(),
				updatedAt: session.updatedAt.toISOString()
			},
			pendingActions: pendingActions.map(a => ({
				id: a.id,
				toolName: a.toolName,
				confirmationMessage: a.confirmationMessage,
				status: a.status,
				createdAt: a.createdAt.toISOString(),
				expiresAt: a.expiresAt.toISOString()
			}))
		});
	} catch (error) {
		console.error('[Office Manager Chat] Get error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// DELETE - Delete a chat session
export const DELETE: RequestHandler = async ({ locals, params }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// Verify ownership first - user is guaranteed to exist after isManager check
		const session = await getChatSessionForUser(params.id, locals.user!.id);
		if (!session) {
			return json({ success: false, error: 'Chat not found' }, { status: 404 });
		}

		await deleteChatSession(params.id);
		return json({ success: true });
	} catch (error) {
		console.error('[Office Manager Chat] Delete error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
