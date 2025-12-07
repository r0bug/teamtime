import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, conversations, conversationParticipants, messages, users } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const preselectedUserId = url.searchParams.get('userId');

	const allUsers = await db
		.select({ id: users.id, name: users.name, role: users.role })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(users.name);

	// Filter out current user
	const availableUsers = allUsers.filter(u => u.id !== locals.user!.id);

	return { users: availableUsers, preselectedUserId };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const recipientId = formData.get('recipientId')?.toString();
		const content = formData.get('content')?.toString().trim();
		const isBroadcast = formData.get('isBroadcast') === 'on';

		if (!recipientId && !isBroadcast) {
			return fail(400, { error: 'Please select a recipient' });
		}

		if (!content) {
			return fail(400, { error: 'Message cannot be empty' });
		}

		let conversationId: string;

		if (isBroadcast) {
			// Create broadcast conversation
			const [newConversation] = await db
				.insert(conversations)
				.values({
					type: 'broadcast',
					title: formData.get('title')?.toString() || 'Broadcast Message',
					createdBy: locals.user.id
				})
				.returning({ id: conversations.id });

			conversationId = newConversation.id;

			// Add all users as participants
			const allUsers = await db.select({ id: users.id }).from(users).where(eq(users.isActive, true));
			for (const user of allUsers) {
				await db.insert(conversationParticipants).values({
					conversationId,
					userId: user.id
				});
			}
		} else {
			// Check for existing direct conversation
			const existingConv = await db
				.select({ conversationId: conversationParticipants.conversationId })
				.from(conversationParticipants)
				.innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
				.where(and(
					eq(conversationParticipants.userId, locals.user.id),
					eq(conversations.type, 'direct')
				));

			let foundConversationId: string | null = null;

			for (const conv of existingConv) {
				const [otherParticipant] = await db
					.select()
					.from(conversationParticipants)
					.where(and(
						eq(conversationParticipants.conversationId, conv.conversationId),
						eq(conversationParticipants.userId, recipientId!)
					))
					.limit(1);

				if (otherParticipant) {
					foundConversationId = conv.conversationId;
					break;
				}
			}

			if (foundConversationId) {
				conversationId = foundConversationId;
			} else {
				// Create new direct conversation
				const [newConversation] = await db
					.insert(conversations)
					.values({
						type: 'direct',
						createdBy: locals.user.id
					})
					.returning({ id: conversations.id });

				conversationId = newConversation.id;

				// Add both participants
				await db.insert(conversationParticipants).values([
					{ conversationId, userId: locals.user.id },
					{ conversationId, userId: recipientId! }
				]);
			}
		}

		// Add the message
		await db.insert(messages).values({
			conversationId,
			senderId: locals.user.id,
			content
		});

		throw redirect(302, `/messages/${conversationId}`);
	}
};
