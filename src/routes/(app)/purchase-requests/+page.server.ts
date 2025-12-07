import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, purchaseRequests, users } from '$lib/server/db';
import { eq, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const isManager = locals.user.role === 'manager';

	const requests = await db
		.select({
			id: purchaseRequests.id,
			description: purchaseRequests.description,
			proposedPrice: purchaseRequests.proposedPrice,
			sellerInfo: purchaseRequests.sellerInfo,
			status: purchaseRequests.status,
			createdAt: purchaseRequests.createdAt,
			decidedAt: purchaseRequests.decidedAt,
			decisionNotes: purchaseRequests.decisionNotes,
			requesterId: purchaseRequests.requesterId,
			requesterName: users.name
		})
		.from(purchaseRequests)
		.leftJoin(users, eq(purchaseRequests.requesterId, users.id))
		.where(isManager ? undefined : eq(purchaseRequests.requesterId, locals.user.id))
		.orderBy(desc(purchaseRequests.createdAt));

	return { requests, isManager };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const description = formData.get('description')?.toString().trim();
		const proposedPrice = formData.get('proposedPrice')?.toString();
		const sellerInfo = formData.get('sellerInfo')?.toString().trim() || null;

		if (!description || !proposedPrice) {
			return fail(400, { error: 'Description and price are required' });
		}

		const price = parseFloat(proposedPrice);
		if (isNaN(price) || price <= 0) {
			return fail(400, { error: 'Please enter a valid price' });
		}

		await db.insert(purchaseRequests).values({
			requesterId: locals.user.id,
			description,
			proposedPrice: price.toFixed(2),
			sellerInfo,
			status: 'pending'
		});

		return { success: true, created: true };
	},

	decide: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const requestId = formData.get('requestId')?.toString();
		const decision = formData.get('decision')?.toString() as 'approved' | 'denied';
		const decisionNotes = formData.get('decisionNotes')?.toString() || null;

		if (!requestId || !decision) {
			return fail(400, { error: 'Invalid request' });
		}

		await db
			.update(purchaseRequests)
			.set({
				status: decision,
				decidedBy: locals.user.id,
				decidedAt: new Date(),
				decisionNotes
			})
			.where(eq(purchaseRequests.id, requestId));

		return { success: true };
	}
};
