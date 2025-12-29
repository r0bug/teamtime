import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	db,
	messages,
	users,
	messagePhotos,
	conversationParticipants,
	threadParticipants,
	conversations
} from '$lib/server/db';
import { eq, and, desc, sql } from 'drizzle-orm';

// GET /api/conversations/[id]/messages/[messageId]/thread - Get thread replies
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: conversationId, messageId } = params;
	if (!conversationId || !messageId) {
		return json({ error: 'Conversation ID and Message ID required' }, { status: 400 });
	}

	// Verify user is a participant
	const participant = await db
		.select()
		.from(conversationParticipants)
		.where(
			and(
				eq(conversationParticipants.conversationId, conversationId),
				eq(conversationParticipants.userId, locals.user.id)
			)
		)
		.limit(1);

	if (participant.length === 0) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Get the parent message
	const [parentMessage] = await db
		.select({
			id: messages.id,
			content: messages.content,
			isSystemMessage: messages.isSystemMessage,
			createdAt: messages.createdAt,
			senderId: messages.senderId,
			senderName: users.name,
			threadReplyCount: messages.threadReplyCount,
			lastThreadReplyAt: messages.lastThreadReplyAt
		})
		.from(messages)
		.leftJoin(users, eq(users.id, messages.senderId))
		.where(
			and(
				eq(messages.id, messageId),
				eq(messages.conversationId, conversationId)
			)
		)
		.limit(1);

	if (!parentMessage) {
		return json({ error: 'Message not found' }, { status: 404 });
	}

	// Get thread replies
	const replies = await db
		.select({
			id: messages.id,
			content: messages.content,
			isSystemMessage: messages.isSystemMessage,
			createdAt: messages.createdAt,
			senderId: messages.senderId,
			senderName: users.name
		})
		.from(messages)
		.leftJoin(users, eq(users.id, messages.senderId))
		.where(eq(messages.parentMessageId, messageId))
		.orderBy(messages.createdAt);

	// Get photos for all messages (parent + replies)
	const allMessageIds = [messageId, ...replies.map((r) => r.id)];
	const photos = await db
		.select()
		.from(messagePhotos)
		.where(sql`${messagePhotos.messageId} IN ${allMessageIds}`);

	// Map photos to messages
	const photoMap = new Map<string, typeof photos>();
	for (const photo of photos) {
		if (!photoMap.has(photo.messageId)) {
			photoMap.set(photo.messageId, []);
		}
		photoMap.get(photo.messageId)!.push(photo);
	}

	// Get thread participants
	const participants = await db
		.select({
			id: users.id,
			name: users.name,
			avatarUrl: users.avatarUrl
		})
		.from(threadParticipants)
		.innerJoin(users, eq(users.id, threadParticipants.userId))
		.where(eq(threadParticipants.messageId, messageId));

	// Update user's last read in thread
	const existingThreadParticipant = await db
		.select()
		.from(threadParticipants)
		.where(
			and(
				eq(threadParticipants.messageId, messageId),
				eq(threadParticipants.userId, locals.user.id)
			)
		)
		.limit(1);

	if (existingThreadParticipant.length > 0) {
		await db
			.update(threadParticipants)
			.set({ lastReadAt: new Date() })
			.where(
				and(
					eq(threadParticipants.messageId, messageId),
					eq(threadParticipants.userId, locals.user.id)
				)
			);
	}

	return json({
		parentMessage: {
			...parentMessage,
			photos: photoMap.get(messageId) || []
		},
		replies: replies.map((reply) => ({
			...reply,
			photos: photoMap.get(reply.id) || []
		})),
		participants
	});
};

// POST /api/conversations/[id]/messages/[messageId]/thread - Reply to thread
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id: conversationId, messageId } = params;
	if (!conversationId || !messageId) {
		return json({ error: 'Conversation ID and Message ID required' }, { status: 400 });
	}

	// Verify user is a participant
	const participant = await db
		.select()
		.from(conversationParticipants)
		.where(
			and(
				eq(conversationParticipants.conversationId, conversationId),
				eq(conversationParticipants.userId, locals.user.id)
			)
		)
		.limit(1);

	if (participant.length === 0) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Verify parent message exists
	const [parentMessage] = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.id, messageId),
				eq(messages.conversationId, conversationId)
			)
		)
		.limit(1);

	if (!parentMessage) {
		return json({ error: 'Parent message not found' }, { status: 404 });
	}

	// Don't allow nested threads (reply to a reply)
	if (parentMessage.parentMessageId) {
		return json({ error: 'Cannot create nested threads' }, { status: 400 });
	}

	const body = await request.json();
	const { content, photos } = body;

	if (!content && (!photos || photos.length === 0)) {
		return json({ error: 'Message content or photos required' }, { status: 400 });
	}

	// Create the reply message
	const [newMessage] = await db
		.insert(messages)
		.values({
			conversationId,
			senderId: locals.user.id,
			content: content || '[Photo]',
			parentMessageId: messageId
		})
		.returning();

	// Add photos if provided
	if (photos && photos.length > 0) {
		await db.insert(messagePhotos).values(
			photos.map((photo: { filePath: string; originalName: string }) => ({
				messageId: newMessage.id,
				filePath: photo.filePath,
				originalName: photo.originalName
			}))
		);
	}

	// Update parent message's thread count and last reply time
	await db
		.update(messages)
		.set({
			threadReplyCount: sql`${messages.threadReplyCount} + 1`,
			lastThreadReplyAt: new Date()
		})
		.where(eq(messages.id, messageId));

	// Add user to thread participants if not already
	const existingThreadParticipant = await db
		.select()
		.from(threadParticipants)
		.where(
			and(
				eq(threadParticipants.messageId, messageId),
				eq(threadParticipants.userId, locals.user.id)
			)
		)
		.limit(1);

	if (existingThreadParticipant.length === 0) {
		await db.insert(threadParticipants).values({
			messageId,
			userId: locals.user.id,
			lastReadAt: new Date()
		});
	}

	// Update conversation's updatedAt
	await db
		.update(conversations)
		.set({ updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));

	return json(
		{
			message: {
				id: newMessage.id,
				content: newMessage.content,
				createdAt: newMessage.createdAt,
				senderId: newMessage.senderId
			}
		},
		{ status: 201 }
	);
};
