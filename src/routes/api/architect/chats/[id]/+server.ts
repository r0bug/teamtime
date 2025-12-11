// Architect Chat Session API - Get, update, delete specific session
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChatSession, updateChatTitle, deleteChatSession } from '$lib/ai/architect';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:architect:chats');

// GET - Get a specific chat session
export const GET: RequestHandler = async ({ params }) => {
	try {
		const session = await getChatSession(params.id);
		if (!session) {
			return json({ success: false, error: 'Session not found' }, { status: 404 });
		}
		return json({
			success: true,
			session: {
				id: session.id,
				title: session.title,
				messages: session.messages,
				contextModules: session.contextModules,
				tokensUsed: session.tokensUsed,
				costCents: session.costCents,
				decisionsCreated: session.decisionsCreated,
				promptsGenerated: session.promptsGenerated,
				createdAt: session.createdAt.toISOString(),
				updatedAt: session.updatedAt.toISOString()
			}
		});
	} catch (error) {
		log.error({ error, chatId: params.id }, 'Error getting architect chat session');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// PATCH - Update session (e.g., title)
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();

		if (body.title !== undefined) {
			await updateChatTitle(params.id, body.title);
		}

		const session = await getChatSession(params.id);
		if (!session) {
			return json({ success: false, error: 'Session not found' }, { status: 404 });
		}

		return json({
			success: true,
			session: {
				id: session.id,
				title: session.title,
				updatedAt: session.updatedAt.toISOString()
			}
		});
	} catch (error) {
		log.error({ error, chatId: params.id }, 'Error updating architect chat session');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// DELETE - Delete a chat session
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await deleteChatSession(params.id);
		return json({ success: true });
	} catch (error) {
		log.error({ error, chatId: params.id }, 'Error deleting architect chat session');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
