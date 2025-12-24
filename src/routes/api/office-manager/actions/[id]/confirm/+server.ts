// Office Manager Action Confirm API - Approve pending actions with AI continuation
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPendingAction,
	approvePendingAction,
	getChatSessionForUser,
	executeConfirmedAction,
	addAssistantMessage
} from '$lib/ai/office-manager/chat';
import { continueAfterConfirmation } from '$lib/ai/office-manager/chat/orchestrator';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:office-manager:actions:confirm');

// POST - Confirm/approve a pending action
export const POST: RequestHandler = async ({ locals, params }) => {
	log.info({ actionId: params.id, userId: locals.user?.id }, 'Confirm action requested');

	// Require any authenticated user (permission check happens at tool level)
	if (!locals.user) {
		log.warn({ actionId: params.id }, 'Confirm action rejected - unauthorized');
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

		// Execute the action (pass user ID for permission checking)
		log.info({ actionId: params.id, toolName: action.toolName }, 'Executing confirmed action');
		const { success, result } = await executeConfirmedAction(params.id, action, locals.user!.id);

		// If execution failed, return JSON error response
		if (!success) {
			const errorMessage = `Action "${action.toolName}" failed: ${(result as { error?: string })?.error || 'Unknown error'}`;
			log.warn({ actionId: params.id, toolName: action.toolName, result }, 'Action execution failed');
			return json({
				success: false,
				result,
				message: errorMessage
			});
		}

		// Mark as approved
		await approvePendingAction(params.id, result as Record<string, unknown>);
		log.info({ actionId: params.id, toolName: action.toolName }, 'Action approved and executed successfully');

		// Stream AI continuation response
		const encoder = new TextEncoder();
		const userId = locals.user!.id;
		const chatId = action.chatId;
		const executedAction = {
			toolName: action.toolName,
			toolArgs: action.toolArgs,
			result: result as Record<string, unknown>
		};

		const stream = new ReadableStream({
			async start(controller) {
				try {
					// First, send the action result event
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({
						type: 'action_confirmed',
						toolName: action.toolName,
						result
					})}\n\n`));

					// Then stream the AI continuation
					for await (const event of continueAfterConfirmation(chatId, executedAction, userId)) {
						const data = JSON.stringify(event);
						controller.enqueue(encoder.encode(`data: ${data}\n\n`));
					}
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
				} catch (error) {
					log.error({ error, actionId: params.id }, 'Continuation stream error');
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
		log.error({ error, actionId: params.id, userId: locals.user?.id }, 'Confirm error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
