// Office Manager Chat Streaming API - Send messages with SSE streaming
import type { RequestHandler } from './$types';
import { getChatSessionForUser } from '$lib/ai/office-manager/chat';
import { isManager } from '$lib/server/auth/roles';
import { processUserMessageStream } from '$lib/ai/office-manager/chat/orchestrator';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:office-manager:chats:stream');

// POST - Send a message and stream AI response
export const POST: RequestHandler = async ({ locals, params, request }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		// Verify ownership - user is guaranteed to exist after isManager check
		const session = await getChatSessionForUser(params.id, locals.user!.id);
		if (!session) {
			return new Response(JSON.stringify({ error: 'Chat not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const body = await request.json();
		const { message } = body;

		if (!message || typeof message !== 'string' || message.trim().length === 0) {
			return new Response(JSON.stringify({ error: 'Message is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Create a readable stream for SSE
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				try {
					for await (const event of processUserMessageStream(params.id, message.trim())) {
						const data = JSON.stringify(event);
						controller.enqueue(encoder.encode(`data: ${data}\n\n`));
					}
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`));
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			}
		});
	} catch (error) {
		log.error({ error, chatId: params.id, userId: locals.user?.id }, 'Stream error');
		return new Response(JSON.stringify({
			error: error instanceof Error ? error.message : 'Unknown error'
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
