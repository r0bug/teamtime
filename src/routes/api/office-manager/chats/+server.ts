// Office Manager Chats API - List and create chat sessions
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChatSession, listChatSessions } from '$lib/ai/office-manager/chat';
import { isManager } from '$lib/server/auth/roles';

// GET - List user's chat sessions
export const GET: RequestHandler = async ({ locals }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// User is guaranteed to exist after isManager check
		const sessions = await listChatSessions(locals.user!.id, 50);
		return json({
			success: true,
			sessions: sessions.map(s => ({
				id: s.id,
				title: s.title,
				messageCount: s.messages.length,
				createdAt: s.createdAt.toISOString(),
				updatedAt: s.updatedAt.toISOString()
			}))
		});
	} catch (error) {
		console.error('[Office Manager Chats] List error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST - Create a new chat session
export const POST: RequestHandler = async ({ locals, request }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const body = await request.json().catch(() => ({}));
		const title = body.title || 'New Chat';

		// User is guaranteed to exist after isManager check
		const session = await createChatSession(locals.user!.id, title);
		return json({
			success: true,
			session: {
				id: session.id,
				title: session.title,
				messages: session.messages,
				createdAt: session.createdAt.toISOString()
			}
		});
	} catch (error) {
		console.error('[Office Manager Chats] Create error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
