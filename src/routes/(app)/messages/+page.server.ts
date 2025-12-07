import type { PageServerLoad } from './$types';
import { db, users, conversations, conversationParticipants, messages } from '$lib/server/db';
import { eq, and, desc, ne, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	// Get all users for new chat
	const allUsers = await db
		.select({ id: users.id, name: users.name, role: users.role, avatarUrl: users.avatarUrl })
		.from(users)
		.where(and(
			ne(users.id, user.id),
			eq(users.isActive, true)
		));

	// Get conversations where user is participant
	const userConversations = await db
		.select({
			id: conversations.id,
			type: conversations.type,
			title: conversations.title,
			createdAt: conversations.createdAt,
			updatedAt: conversations.updatedAt,
			lastReadAt: conversationParticipants.lastReadAt,
			isArchived: conversationParticipants.isArchived
		})
		.from(conversationParticipants)
		.innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
		.where(
			and(
				eq(conversationParticipants.userId, user.id),
				eq(conversationParticipants.isArchived, false)
			)
		)
		.orderBy(desc(conversations.updatedAt));

	// For each conversation, get participants and last message
	const conversationsWithDetails = await Promise.all(
		userConversations.map(async (conv) => {
			const participants = await db
				.select({
					id: users.id,
					name: users.name,
					avatarUrl: users.avatarUrl
				})
				.from(conversationParticipants)
				.innerJoin(users, eq(users.id, conversationParticipants.userId))
				.where(eq(conversationParticipants.conversationId, conv.id));

			const [lastMessage] = await db
				.select({
					id: messages.id,
					content: messages.content,
					createdAt: messages.createdAt,
					senderName: users.name
				})
				.from(messages)
				.leftJoin(users, eq(users.id, messages.senderId))
				.where(eq(messages.conversationId, conv.id))
				.orderBy(desc(messages.createdAt))
				.limit(1);

			// Count unread
			const [{ count: unreadCount }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(messages)
				.where(
					and(
						eq(messages.conversationId, conv.id),
						conv.lastReadAt
							? sql`${messages.createdAt} > ${conv.lastReadAt}`
							: sql`1=1`
					)
				);

			return {
				...conv,
				participants,
				lastMessage,
				unreadCount
			};
		})
	);

	return {
		conversations: conversationsWithDetails,
		users: allUsers
	};
};
