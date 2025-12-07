import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, conversations, conversationParticipants, messages, users } from '$lib/server/db';
import { eq, and, desc, sql } from 'drizzle-orm';

// Get conversations
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

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
				eq(conversationParticipants.userId, locals.user.id),
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
					name: users.name
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

	return json({ conversations: conversationsWithDetails });
};

// Create conversation
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { type, title, participantIds, initialMessage } = body;

	if (!participantIds || participantIds.length === 0) {
		return json({ error: 'At least one participant is required' }, { status: 400 });
	}

	// For direct conversations, check if one already exists between these users
	if (type === 'direct' && participantIds.length === 1) {
		const existingConversations = await db
			.select({ conversationId: conversationParticipants.conversationId })
			.from(conversationParticipants)
			.innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
			.where(
				and(
					eq(conversationParticipants.userId, locals.user.id),
					eq(conversations.type, 'direct')
				)
			);

		for (const conv of existingConversations) {
			const [otherParticipant] = await db
				.select()
				.from(conversationParticipants)
				.where(
					and(
						eq(conversationParticipants.conversationId, conv.conversationId),
						eq(conversationParticipants.userId, participantIds[0])
					)
				)
				.limit(1);

			if (otherParticipant) {
				return json({ conversation: { id: conv.conversationId }, existing: true });
			}
		}
	}

	// Create new conversation
	const [newConversation] = await db
		.insert(conversations)
		.values({
			type: type || 'direct',
			title: title || null,
			createdBy: locals.user.id
		})
		.returning();

	// Add creator as participant
	await db.insert(conversationParticipants).values({
		conversationId: newConversation.id,
		userId: locals.user.id,
		lastReadAt: new Date()
	});

	// Add other participants
	for (const participantId of participantIds) {
		if (participantId !== locals.user.id) {
			await db.insert(conversationParticipants).values({
				conversationId: newConversation.id,
				userId: participantId
			});
		}
	}

	// Send initial message if provided
	if (initialMessage) {
		await db.insert(messages).values({
			conversationId: newConversation.id,
			senderId: locals.user.id,
			content: initialMessage
		});

		await db
			.update(conversations)
			.set({ updatedAt: new Date() })
			.where(eq(conversations.id, newConversation.id));
	}

	return json({ conversation: newConversation }, { status: 201 });
};
