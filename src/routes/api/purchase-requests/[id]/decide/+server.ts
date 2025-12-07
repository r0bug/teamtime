import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, purchaseRequests, tasks, notifications, auditLogs } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const [existingRequest] = await db
		.select()
		.from(purchaseRequests)
		.where(eq(purchaseRequests.id, params.id))
		.limit(1);

	if (!existingRequest) {
		return json({ error: 'Purchase request not found' }, { status: 404 });
	}

	if (existingRequest.status !== 'pending') {
		return json({ error: 'Request already decided' }, { status: 400 });
	}

	const body = await request.json();
	const { decision, notes } = body;

	if (!decision || !['approved', 'denied'].includes(decision)) {
		return json({ error: 'Invalid decision' }, { status: 400 });
	}

	// Update purchase request
	const [updatedRequest] = await db
		.update(purchaseRequests)
		.set({
			status: decision,
			decidedBy: locals.user.id,
			decidedAt: new Date(),
			decisionNotes: notes || null
		})
		.where(eq(purchaseRequests.id, params.id))
		.returning();

	// Update associated task
	if (existingRequest.taskId) {
		await db
			.update(tasks)
			.set({
				status: 'completed',
				updatedAt: new Date()
			})
			.where(eq(tasks.id, existingRequest.taskId));
	}

	// Notify requester
	await db.insert(notifications).values({
		userId: existingRequest.requesterId,
		type: 'purchase_decision',
		title: `Purchase Request ${decision === 'approved' ? 'Approved' : 'Denied'}`,
		body: notes || `Your purchase request has been ${decision}.`,
		data: { purchaseRequestId: params.id, decision }
	});

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'decide',
		entityType: 'purchase_request',
		entityId: params.id,
		beforeData: { status: 'pending' },
		afterData: { status: decision, notes },
		ipAddress: getClientAddress()
	});

	return json({ purchaseRequest: updatedRequest });
};
