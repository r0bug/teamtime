import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, staffNotes } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import { isVendorPortalUser } from '$lib/server/auth/vendor-portal';
import { isUuid } from '$lib/utils';

const log = createLogger('api:notes:id');

// DELETE /api/notes/[id] — soft delete (staff only; vendors are read-only).
// Kept in history with who removed it and when.
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (await isVendorPortalUser(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	// Non-UUID ids would throw at the query and surface as a 500.
	if (!isUuid(params.id)) {
		return json({ error: 'Note not found' }, { status: 404 });
	}

	try {
		// Conditional update: only an active note can be deleted, so a concurrent
		// delete can't silently overwrite who removed it and when.
		const [note] = await db
			.update(staffNotes)
			.set({
				status: 'deleted',
				deletedByUserId: locals.user.id,
				deletedAt: new Date(),
				updatedAt: new Date()
			})
			.where(and(eq(staffNotes.id, params.id), eq(staffNotes.status, 'active')))
			.returning({ id: staffNotes.id });

		if (!note) {
			const [existing] = await db
				.select({ status: staffNotes.status })
				.from(staffNotes)
				.where(eq(staffNotes.id, params.id))
				.limit(1);
			if (!existing) {
				return json({ error: 'Note not found' }, { status: 404 });
			}
			return json({ error: 'Note is already deleted' }, { status: 409 });
		}

		return json({ success: true });
	} catch (error) {
		log.error({ error, noteId: params.id, userId: locals.user.id }, 'Error deleting note');
		return json({ error: 'Failed to delete note' }, { status: 500 });
	}
};
