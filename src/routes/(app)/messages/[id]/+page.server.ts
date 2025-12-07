import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db, conversations, conversationParticipants, messages, users } from '$lib/server/db';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Check if user is a participant
	const [participant] = await db
		.select()
		.from(conversationParticipants)
		.where(and(
			eq(conversationParticipants.conversationId, params.id),
			eq(conversationParticipants.userId, locals.user.id)
		))
		.limit(1);

	if (!participant) {
		throw error(403, 'Not a participant in this conversation');
	}

	const [conversation] = await db
		.select({
			id: conversations.id,
			type: conversations.type,
			title: conversations.title,
			createdAt: conversations.createdAt
		})
		.from(conversations)
		.where(eq(conversations.id, params.id))
		.limit(1);

	if (!conversation) {
		throw error(404, 'Conversation not found');
	}

	const participants = await db
		.select({
			userId: conversationParticipants.userId,
			userName: users.name
		})
		.from(conversationParticipants)
		.leftJoin(users, eq(conversationParticipants.userId, users.id))
		.where(eq(conversationParticipants.conversationId, params.id));

	const conversationMessages = await db
		.select({
			id: messages.id,
			content: messages.content,
			senderId: messages.senderId,
			senderName: users.name,
			isSystemMessage: messages.isSystemMessage,
			createdAt: messages.createdAt
		})
		.from(messages)
		.leftJoin(users, eq(messages.senderId, users.id))
		.where(eq(messages.conversationId, params.id))
		.orderBy(messages.createdAt);

	// Update last read
	await db
		.update(conversationParticipants)
		.set({ lastReadAt: new Date() })
		.where(and(
			eq(conversationParticipants.conversationId, params.id),
			eq(conversationParticipants.userId, locals.user.id)
		));

	// For direct messages, get other participant's name as title
	let displayTitle = conversation.title;
	if (conversation.type === 'direct' && !displayTitle) {
		const otherParticipant = participants.find(p => p.userId !== locals.user.id);
		displayTitle = otherParticipant?.userName || 'Direct Message';
	}

	return {
		conversation: { ...conversation, displayTitle },
		participants,
		messages: conversationMessages,
		currentUserId: locals.user.id
	};
};

export const actions: Actions = {
	send: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const content = formData.get('content')?.toString().trim();

		if (!content) {
			return fail(400, { error: 'Message cannot be empty' });
		}

		await db.insert(messages).values({
			conversationId: params.id,
			senderId: locals.user.id,
			content
		});

		await db
			.update(conversations)
			.set({ updatedAt: new Date() })
			.where(eq(conversations.id, params.id));

		return { success: true };
	}
};
