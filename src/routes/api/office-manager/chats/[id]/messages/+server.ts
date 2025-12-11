// Office Manager Chat Messages API - Send messages
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChatSessionForUser, processUserMessage } from '$lib/ai/office-manager/chat';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:office-manager:chats:messages');

// POST - Send a message and get AI response
export const POST: RequestHandler = async ({ locals, params, request }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// Verify ownership - user is guaranteed to exist after isManager check
		const session = await getChatSessionForUser(params.id, locals.user!.id);
		if (!session) {
			return json({ success: false, error: 'Chat not found' }, { status: 404 });
		}

		const body = await request.json();
		const { message } = body;

		if (!message || typeof message !== 'string' || message.trim().length === 0) {
			return json({ success: false, error: 'Message is required' }, { status: 400 });
		}

		// Process the message and get AI response
		const result = await processUserMessage(params.id, message.trim());

		return json({
			success: true,
			response: result.response,
			toolCalls: result.toolCalls.map(tc => ({
				name: tc.name,
				params: tc.params,
				result: tc.result,
				pendingActionId: tc.pendingActionId,
				requiresConfirmation: tc.requiresConfirmation
			})),
			pendingActions: result.pendingActions.map(a => ({
				id: a.id,
				toolName: a.toolName,
				confirmationMessage: a.confirmationMessage,
				createdAt: a.createdAt.toISOString(),
				expiresAt: a.expiresAt.toISOString()
			})),
			tokensUsed: result.tokensUsed
		});
	} catch (error) {
		log.error({ error, chatId: params.id, userId: locals.user?.id }, 'Message error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
