// Architect Chats API - List and create chat sessions
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createChatSession, listChatSessions } from '$lib/ai/architect';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:architect:chats');

// GET - List all chat sessions
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const sessions = await listChatSessions(50);
		return json({
			success: true,
			sessions: sessions.map(s => ({
				id: s.id,
				title: s.title,
				messageCount: s.messages.length,
				tokensUsed: s.tokensUsed,
				costCents: s.costCents,
				decisionsCreated: s.decisionsCreated.length,
				promptsGenerated: s.promptsGenerated,
				createdAt: s.createdAt.toISOString(),
				updatedAt: s.updatedAt.toISOString()
			}))
		});
	} catch (error) {
		log.error({ error }, 'List error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST - Create a new chat session
export const POST: RequestHandler = async ({ locals }) => {
	try {
		// Get user ID from session if available
		const userId = locals.user?.id;
		const session = await createChatSession(userId);
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
		log.error({ error, userId: locals.user?.id }, 'Create error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
