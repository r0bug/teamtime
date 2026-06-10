import type { PageServerLoad } from './$types';
import { db, staffNotes, users } from '$lib/server/db';
import { eq, and, or, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	// Vendors see only notes directed at them personally or at all vendors.
	const noteRecipient = alias(users, 'note_recipient');
	const notes = await db
		.select({
			id: staffNotes.id,
			body: staffNotes.body,
			photoPath: staffNotes.photoPath,
			createdAt: staffNotes.createdAt,
			createdByName: users.name,
			recipientGroup: staffNotes.recipientGroup,
			recipientUserId: staffNotes.recipientUserId,
			recipientName: noteRecipient.name
		})
		.from(staffNotes)
		.leftJoin(users, eq(staffNotes.createdByUserId, users.id))
		.leftJoin(noteRecipient, eq(staffNotes.recipientUserId, noteRecipient.id))
		.where(
			and(
				eq(staffNotes.status, 'active'),
				or(eq(staffNotes.recipientUserId, userId), eq(staffNotes.recipientGroup, 'all_vendors'))
			)
		)
		.orderBy(desc(staffNotes.createdAt))
		.limit(200);

	return { notes, currentUserId: userId };
};
