import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, users, messages, conversations, conversationParticipants } from '$lib/server/db';
import { eq, desc, sql, and } from 'drizzle-orm';
import { isManager, isAdmin, canViewAllCommunications } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get all conversations with participant info
	const allConversations = await db
		.select({
			id: conversations.id,
			type: conversations.type,
			title: conversations.title,
			createdAt: conversations.createdAt,
			updatedAt: conversations.updatedAt,
			messageCount: sql<number>`(SELECT count(*) FROM messages WHERE messages.conversation_id = conversations.id)`,
			lastMessage: sql<string>`(SELECT content FROM messages WHERE messages.conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1)`
		})
		.from(conversations)
		.orderBy(desc(conversations.updatedAt))
		.limit(100);

	// Get participants for each conversation
	const conversationsWithParticipants = await Promise.all(
		allConversations.map(async (conv) => {
			const participants = await db
				.select({
					id: users.id,
					name: users.name,
					email: users.email
				})
				.from(conversationParticipants)
				.innerJoin(users, eq(conversationParticipants.userId, users.id))
				.where(eq(conversationParticipants.conversationId, conv.id));

			return {
				...conv,
				participants
			};
		})
	);

	// Get all users for creating new messages
	const allUsers = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	return {
		isAdmin: isAdmin(locals.user),
		canViewAll: canViewAllCommunications(locals.user),
		conversations: conversationsWithParticipants,
		users: allUsers
	};
};
