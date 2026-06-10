import type { PageServerLoad } from './$types';
import { db, staffNotes, users } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const recipient = alias(users, 'recipient_user');
const deletedBy = alias(users, 'deleted_by_user');

export const load: PageServerLoad = async () => {
	const notes = await db
		.select({
			id: staffNotes.id,
			body: staffNotes.body,
			photoPath: staffNotes.photoPath,
			createdAt: staffNotes.createdAt,
			deletedAt: staffNotes.deletedAt,
			createdByName: users.name,
			recipientGroup: staffNotes.recipientGroup,
			recipientName: recipient.name,
			deletedByName: deletedBy.name
		})
		.from(staffNotes)
		.leftJoin(users, eq(staffNotes.createdByUserId, users.id))
		.leftJoin(recipient, eq(staffNotes.recipientUserId, recipient.id))
		.leftJoin(deletedBy, eq(staffNotes.deletedByUserId, deletedBy.id))
		.where(eq(staffNotes.status, 'deleted'))
		.orderBy(desc(staffNotes.deletedAt))
		.limit(300);

	return { notes };
};
