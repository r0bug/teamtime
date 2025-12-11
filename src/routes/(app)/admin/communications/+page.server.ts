import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, conversations, messages, users, conversationParticipants } from '$lib/server/db';
import { desc, eq, sql } from 'drizzle-orm';
import { isAdmin } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isAdmin(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = 50;
	const offset = (page - 1) * limit;

	// Get all conversations with their latest message and participant info
	const allConversations = await db
		.select({
			id: conversations.id,
			type: conversations.type,
			title: conversations.title,
			createdAt: conversations.createdAt,
			updatedAt: conversations.updatedAt,
			creatorId: conversations.createdBy,
			creatorName: users.name
		})
		.from(conversations)
		.leftJoin(users, eq(conversations.createdBy, users.id))
		.orderBy(desc(conversations.updatedAt))
		.limit(limit)
		.offset(offset);

	// Get participant counts and last messages for each conversation
	const conversationDetails = await Promise.all(
		allConversations.map(async (conv) => {
			const participants = await db
				.select({
					userId: conversationParticipants.userId,
					userName: users.name,
					userEmail: users.email
				})
				.from(conversationParticipants)
				.leftJoin(users, eq(conversationParticipants.userId, users.id))
				.where(eq(conversationParticipants.conversationId, conv.id));

			const lastMessage = await db
				.select({
					id: messages.id,
					content: messages.content,
					createdAt: messages.createdAt,
					senderName: users.name
				})
				.from(messages)
				.leftJoin(users, eq(messages.senderId, users.id))
				.where(eq(messages.conversationId, conv.id))
				.orderBy(desc(messages.createdAt))
				.limit(1);

			const messageCount = await db
				.select({ count: sql<number>`count(*)` })
				.from(messages)
				.where(eq(messages.conversationId, conv.id));

			return {
				...conv,
				participants,
				lastMessage: lastMessage[0] || null,
				messageCount: messageCount[0]?.count || 0
			};
		})
	);

	return { conversations: conversationDetails, page };
};
