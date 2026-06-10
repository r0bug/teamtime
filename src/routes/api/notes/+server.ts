import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, staffNotes, users } from '$lib/server/db';
import { eq, desc, and, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createLogger } from '$lib/server/logger';
import { isVendorPortalUser } from '$lib/server/auth/vendor-portal';
import { isUploadPath } from '$lib/uploads';
import { isUuid } from '$lib/utils';

const log = createLogger('api:notes');

const recipient = alias(users, 'recipient_user');

// GET /api/notes — active notes. Staff see the shared board; vendors see only
// notes addressed to them or to all vendors.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const viewerIsVendor = await isVendorPortalUser(locals.user);
		const where = viewerIsVendor
			? and(
					eq(staffNotes.status, 'active'),
					or(
						eq(staffNotes.recipientUserId, locals.user.id),
						eq(staffNotes.recipientGroup, 'all_vendors')
					)
				)
			: eq(staffNotes.status, 'active');

		const notes = await db
			.select({
				id: staffNotes.id,
				body: staffNotes.body,
				photoPath: staffNotes.photoPath,
				createdAt: staffNotes.createdAt,
				createdByUserId: staffNotes.createdByUserId,
				createdByName: users.name,
				recipientGroup: staffNotes.recipientGroup,
				recipientUserId: staffNotes.recipientUserId,
				recipientName: recipient.name
			})
			.from(staffNotes)
			.leftJoin(users, eq(staffNotes.createdByUserId, users.id))
			.leftJoin(recipient, eq(staffNotes.recipientUserId, recipient.id))
			.where(where)
			.orderBy(desc(staffNotes.createdAt))
			.limit(300);

		return json({ notes });
	} catch (error) {
		log.error({ error, userId: locals.user.id }, 'Error fetching notes');
		return json({ error: 'Failed to fetch notes' }, { status: 500 });
	}
};

// POST /api/notes — create a note (staff only; vendors are read-only here)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (await isVendorPortalUser(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { recipientGroup, recipientUserId, body: noteBody, photo } = body;

		const hasText = typeof noteBody === 'string' && noteBody.trim().length > 0;
		const hasPhoto = photo && photo.filePath;
		if (!hasText && !hasPhoto) {
			return json({ error: 'A note needs text, a photo, or both' }, { status: 400 });
		}

		// Validate the photo path is a local upload path before we store it.
		if (hasPhoto && !isUploadPath(photo.filePath)) {
			return json({ error: 'Invalid photo path' }, { status: 400 });
		}

		// Target is exactly one of group / user. Group must be a known value.
		if (recipientGroup && recipientUserId) {
			return json({ error: 'A note can target a group or a person, not both' }, { status: 400 });
		}
		if (recipientGroup && !['all_staff', 'all_vendors'].includes(recipientGroup)) {
			return json({ error: 'Invalid recipient group' }, { status: 400 });
		}
		// A personal target must be a real user — a bad id would otherwise
		// surface as a 500 from the uuid cast or the FK violation.
		if (recipientUserId) {
			if (!isUuid(recipientUserId)) {
				return json({ error: 'Invalid recipient' }, { status: 400 });
			}
			const [target] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.id, recipientUserId))
				.limit(1);
			if (!target) {
				return json({ error: 'Recipient not found' }, { status: 400 });
			}
		}
		// Default to all staff when nothing was chosen.
		const group = recipientUserId ? null : recipientGroup || 'all_staff';

		const [note] = await db
			.insert(staffNotes)
			.values({
				createdByUserId: locals.user.id,
				recipientGroup: group,
				recipientUserId: recipientUserId || null,
				body: hasText ? noteBody.trim() : null,
				photoPath: hasPhoto ? photo.filePath : null,
				photoOriginalName: hasPhoto ? photo.originalName || 'photo' : null,
				photoMimeType: hasPhoto ? photo.mimeType || 'image/jpeg' : null,
				photoSizeBytes: hasPhoto ? photo.sizeBytes || 0 : null
			})
			.returning();

		return json({ success: true, note }, { status: 201 });
	} catch (error) {
		log.error({ error, userId: locals.user.id }, 'Error creating note');
		return json({ error: 'Failed to create note' }, { status: 500 });
	}
};
