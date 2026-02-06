import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, shiftRequests, shiftRequestResponses } from '$lib/server/db';
import { eq } from 'drizzle-orm';

// POST - Respond to a shift request (accept/decline)
export const POST: RequestHandler = async ({ locals, request, params }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const { status, note } = await request.json();

	if (!status || !['accepted', 'declined'].includes(status)) {
		throw error(400, 'Status must be "accepted" or "declined"');
	}

	// Check the request exists and is still open
	const [shiftRequest] = await db
		.select()
		.from(shiftRequests)
		.where(eq(shiftRequests.id, params.id))
		.limit(1);

	if (!shiftRequest) throw error(404, 'Shift request not found');
	if (shiftRequest.status !== 'open') throw error(400, 'This shift request is no longer open');

	// Insert response (upsert via unique constraint)
	const [response] = await db
		.insert(shiftRequestResponses)
		.values({
			requestId: params.id,
			userId: locals.user.id,
			status,
			note: note || null
		})
		.onConflictDoUpdate({
			target: [shiftRequestResponses.requestId, shiftRequestResponses.userId],
			set: { status, note: note || null, respondedAt: new Date() }
		})
		.returning();

	// If accepted, fill the request
	if (status === 'accepted') {
		await db
			.update(shiftRequests)
			.set({
				status: 'filled',
				filledBy: locals.user.id,
				updatedAt: new Date()
			})
			.where(eq(shiftRequests.id, params.id));
	}

	return json(response);
};
