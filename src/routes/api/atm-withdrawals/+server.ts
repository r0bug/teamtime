import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, atmWithdrawals, auditLogs } from '$lib/server/db';
import { eq, and, desc } from 'drizzle-orm';

// Get ATM withdrawals
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const status = url.searchParams.get('status');
	const userId = url.searchParams.get('userId');
	const conditions = [];

	// Non-managers see only their own withdrawals
	if (locals.user.role !== 'manager') {
		conditions.push(eq(atmWithdrawals.userId, locals.user.id));
	} else if (userId) {
		conditions.push(eq(atmWithdrawals.userId, userId));
	}

	if (status) {
		conditions.push(eq(atmWithdrawals.status, status as 'unassigned' | 'partially_assigned' | 'fully_spent'));
	}

	const withdrawals = await db.query.atmWithdrawals.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(atmWithdrawals.withdrawnAt)],
		with: {
			user: { columns: { id: true, name: true } },
			allocations: {
				with: {
					photos: true,
					purchaseRequest: { columns: { id: true, description: true } }
				}
			}
		}
	});

	return json({ withdrawals });
};

// Create ATM withdrawal
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Only purchasers and managers can log withdrawals
	if (locals.user.role === 'staff') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json();
	const { amount, withdrawnAt, lat, lng, address, receiptPhotoPath, notes } = body;

	if (!amount || !withdrawnAt) {
		return json({ error: 'Amount and withdrawal time are required' }, { status: 400 });
	}

	const [withdrawal] = await db
		.insert(atmWithdrawals)
		.values({
			userId: locals.user.id,
			amount: amount.toString(),
			withdrawnAt: new Date(withdrawnAt),
			lat: lat || null,
			lng: lng || null,
			address: address || null,
			receiptPhotoPath: receiptPhotoPath || null,
			notes: notes || null,
			status: 'unassigned'
		})
		.returning();

	// Audit log
	await db.insert(auditLogs).values({
		userId: locals.user.id,
		action: 'create',
		entityType: 'atm_withdrawal',
		entityId: withdrawal.id,
		afterData: { amount, withdrawnAt },
		ipAddress: getClientAddress()
	});

	return json({ withdrawal }, { status: 201 });
};
