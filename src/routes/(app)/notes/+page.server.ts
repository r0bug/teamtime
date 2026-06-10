import type { PageServerLoad } from './$types';
import { db, staffNotes, users } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const recipient = alias(users, 'recipient_user');

export const load: PageServerLoad = async ({ locals }) => {
	const notes = await db
		.select({
			id: staffNotes.id,
			body: staffNotes.body,
			photoPath: staffNotes.photoPath,
			createdAt: staffNotes.createdAt,
			createdByName: users.name,
			recipientGroup: staffNotes.recipientGroup,
			recipientUserId: staffNotes.recipientUserId,
			recipientName: recipient.name
		})
		.from(staffNotes)
		.leftJoin(users, eq(staffNotes.createdByUserId, users.id))
		.leftJoin(recipient, eq(staffNotes.recipientUserId, recipient.id))
		.where(eq(staffNotes.status, 'active'))
		.orderBy(desc(staffNotes.createdAt))
		.limit(300);

	return { notes, currentUserId: locals.user!.id };
};
