import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, atmWithdrawals, withdrawalAllocations, allocationPhotos, auditLogs } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [withdrawal] = await db
		.select()
		.from(atmWithdrawals)
		.where(eq(atmWithdrawals.id, params.id))
		.limit(1);

	if (!withdrawal) {
		return json({ error: 'Withdrawal not found' }, { status: 404 });
	}

	// Check access
	if (withdrawal.userId !== locals.user.id && locals.user.role !== 'manager') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { amount, productDescription, purchaseRequestId, photos } = body;

	if (!amount) {
		return json({ error: 'Amount is required' }, { status: 400 });
	}

	// Check remaining balance
	const [{ total }] = await db
		.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
		.from(withdrawalAllocations)
		.where(eq(withdrawalAllocations.withdrawalId, params.id));

	const allocated = parseFloat(total);
	const withdrawalAmount = parseFloat(withdrawal.amount);
	const remaining = withdrawalAmount - allocated;

	if (parseFloat(amount) > remaining) {
		return json({ error: `Cannot allocate more than remaining balance ($${remaining.toFixed(2)})` }, { status: 400 });
	}

	// Create allocation
	const [allocation] = await db
		.insert(withdrawalAllocations)
		.values({
			withdrawalId: params.id,
			amount: amount.toString(),
			productDescription: productDescription || null,
			purchaseRequestId: purchaseRequestId || null
		})
		.returning();

	// Add photos if provided
	if (photos && photos.length > 0) {
		for (const photo of photos) {
			await db.insert(allocationPhotos).values({
				allocationId: allocation.id,
				filePath: photo.filePath,
				originalName: photo.originalName,
				lat: photo.lat || null,
				lng: photo.lng || null,
				capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : null
			});
		}
	}

	// Update withdrawal status
	const newAllocated = allocated + parseFloat(amount);
	let newStatus: 'unassigned' | 'partially_assigned' | 'fully_spent' = 'partially_assigned';
	if (newAllocated >= withdrawalAmount) {
		newStatus = 'fully_spent';
	}

	await db
		.update(atmWithdrawals)
		.set({ status: newStatus, updatedAt: new Date() })
		.where(eq(atmWithdrawals.id, params.id));

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'allocate',
		entityType: 'atm_withdrawal',
		entityId: params.id,
		afterData: { allocationId: allocation.id, amount, productDescription },
		ipAddress: getClientAddress()
	});

	return json({ allocation });
};
