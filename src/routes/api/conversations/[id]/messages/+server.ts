import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, conversations, conversationParticipants, messages, messagePhotos, users, notifications } from '$lib/server/db';
import { eq, and, desc, lt } from 'drizzle-orm';

// Get messages
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check if user is participant
	const [participant] = await db
		.select()
		.from(conversationParticipants)
		.where(
			and(
				eq(conversationParticipants.conversationId, params.id),
				eq(conversationParticipants.userId, locals.user.id)
			)
		)
		.limit(1);

	if (!participant) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const before = url.searchParams.get('before');
	const limit = parseInt(url.searchParams.get('limit') || '50');

	let query = db
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
		.where(eq(messages.conversationId, params.id))
		.orderBy(desc(messages.createdAt))
		.limit(limit);

	if (before) {
		query = db
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
			.where(
				and(
					eq(messages.conversationId, params.id),
					lt(messages.createdAt, new Date(before))
				)
			)
			.orderBy(desc(messages.createdAt))
			.limit(limit);
	}

	const messageList = await query;

	// Get photos for messages
	const messagesWithPhotos = await Promise.all(
		messageList.map(async (msg) => {
			const photos = await db
				.select()
				.from(messagePhotos)
				.where(eq(messagePhotos.messageId, msg.id));
			return { ...msg, photos };
		})
	);

	// Update last read
	await db
		.update(conversationParticipants)
		.set({ lastReadAt: new Date() })
		.where(
			and(
				eq(conversationParticipants.conversationId, params.id),
				eq(conversationParticipants.userId, locals.user.id)
			)
		);

	return json({ messages: messagesWithPhotos.reverse() });
};

// Send message
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check if user is participant
	const [participant] = await db
		.select()
		.from(conversationParticipants)
		.where(
			and(
				eq(conversationParticipants.conversationId, params.id),
				eq(conversationParticipants.userId, locals.user.id)
			)
		)
		.limit(1);

	if (!participant) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { content, photos } = body;

	if (!content && (!photos || photos.length === 0)) {
		return json({ error: 'Message content or photos required' }, { status: 400 });
	}

	// Create message
	const [newMessage] = await db
		.insert(messages)
		.values({
			conversationId: params.id,
			senderId: locals.user.id,
			content: content || '[Photo]'
		})
		.returning();

	// Add photos if provided
	if (photos && photos.length > 0) {
		for (const photo of photos) {
			await db.insert(messagePhotos).values({
				messageId: newMessage.id,
				filePath: photo.filePath,
				originalName: photo.originalName
			});
		}
	}

	// Update conversation
	await db
		.update(conversations)
		.set({ updatedAt: new Date() })
		.where(eq(conversations.id, params.id));

	// Update sender's last read
	await db
		.update(conversationParticipants)
		.set({ lastReadAt: new Date() })
		.where(
			and(
				eq(conversationParticipants.conversationId, params.id),
				eq(conversationParticipants.userId, locals.user.id)
			)
		);

	// Notify other participants
	const otherParticipants = await db
		.select({ userId: conversationParticipants.userId })
		.from(conversationParticipants)
		.where(
			and(
				eq(conversationParticipants.conversationId, params.id),
				eq(conversationParticipants.isArchived, false)
			)
		);

	for (const p of otherParticipants) {
		if (p.userId !== locals.user.id) {
			await db.insert(notifications).values({
				userId: p.userId,
				type: 'new_message',
				title: `New message from ${locals.user.name}`,
				body: content ? content.substring(0, 100) : '[Photo]',
				data: { conversationId: params.id, messageId: newMessage.id }
			});
		}
	}

	return json({
		message: {
			...newMessage,
			senderName: locals.user.name
		}
	}, { status: 201 });
};
