import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, purchaseRequests, tasks, notifications, users } from '$lib/server/db';
import { eq, and, desc } from 'drizzle-orm';

// Get purchase requests
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const status = url.searchParams.get('status');
	const conditions = [];

	// Non-managers see only their own requests
	if (locals.user.role !== 'manager') {
		conditions.push(eq(purchaseRequests.requesterId, locals.user.id));
	}

	if (status) {
		conditions.push(eq(purchaseRequests.status, status as 'pending' | 'approved' | 'denied'));
	}

	const requests = await db.query.purchaseRequests.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(purchaseRequests.createdAt)],
		with: {
			requester: { columns: { id: true, name: true } },
			decider: { columns: { id: true, name: true } },
			task: { columns: { id: true, title: true } }
		}
	});

	return json({ purchaseRequests: requests });
};

// Create purchase request
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Only purchasers and managers can create requests
	if (locals.user.role === 'staff') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { description, proposedPrice, sellerInfo, lat, lng, address, photos } = body;

	if (!description || proposedPrice === undefined) {
		return json({ error: 'Description and proposed price are required' }, { status: 400 });
	}

	// Create associated task for manager approval
	const [task] = await db
		.insert(tasks)
		.values({
			title: `Purchase Approval: ${description.substring(0, 50)}`,
			description: `Requested by ${locals.user.name}\nPrice: $${proposedPrice}\n\n${description}`,
			status: 'not_started',
			priority: 'high',
			source: 'purchase_approval',
			photoRequired: false,
			notesRequired: false,
			createdBy: locals.user.id
		})
		.returning();

	// Create purchase request
	const [newRequest] = await db
		.insert(purchaseRequests)
		.values({
			taskId: task.id,
			requesterId: locals.user.id,
			description,
			proposedPrice: proposedPrice.toString(),
			sellerInfo: sellerInfo || null,
			lat: lat || null,
			lng: lng || null,
			address: address || null,
			status: 'pending'
		})
		.returning();

	// Notify all managers
	const managers = await db
		.select()
		.from(users)
		.where(eq(users.role, 'manager'));

	for (const manager of managers) {
		await db.insert(notifications).values({
			userId: manager.id,
			type: 'task_assigned',
			title: 'New Purchase Request',
			body: `${locals.user.name} is requesting approval for: ${description.substring(0, 50)}`,
			data: { purchaseRequestId: newRequest.id, taskId: task.id }
		});
	}

	return json({ purchaseRequest: newRequest }, { status: 201 });
};
