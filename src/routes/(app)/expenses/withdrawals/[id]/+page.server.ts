import type { Actions, PageServerLoad } from './$types';
import { fail, redirect, error } from '@sveltejs/kit';
import { db, atmWithdrawals, withdrawalAllocations, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const [withdrawal] = await db
		.select({
			id: atmWithdrawals.id,
			userId: atmWithdrawals.userId,
			amount: atmWithdrawals.amount,
			withdrawnAt: atmWithdrawals.withdrawnAt,
			address: atmWithdrawals.address,
			status: atmWithdrawals.status,
			notes: atmWithdrawals.notes,
			createdAt: atmWithdrawals.createdAt,
			userName: users.name
		})
		.from(atmWithdrawals)
		.leftJoin(users, eq(atmWithdrawals.userId, users.id))
		.where(eq(atmWithdrawals.id, params.id))
		.limit(1);

	if (!withdrawal) {
		throw error(404, 'Withdrawal not found');
	}

	// Only allow owner or manager to view
	if (withdrawal.userId !== locals.user.id && locals.user.role !== 'manager') {
		throw error(403, 'Not authorized to view this withdrawal');
	}

	const allocations = await db
		.select({
			id: withdrawalAllocations.id,
			amount: withdrawalAllocations.amount,
			productDescription: withdrawalAllocations.productDescription,
			createdAt: withdrawalAllocations.createdAt
		})
		.from(withdrawalAllocations)
		.where(eq(withdrawalAllocations.withdrawalId, params.id));

	const totalAllocated = allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
	const remaining = parseFloat(withdrawal.amount) - totalAllocated;

	return {
		withdrawal,
		allocations,
		totalAllocated,
		remaining,
		isOwner: withdrawal.userId === locals.user.id,
		isManager: locals.user.role === 'manager'
	};
};

export const actions: Actions = {
	allocate: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const amount = formData.get('amount')?.toString();
		const productDescription = formData.get('productDescription')?.toString().trim();

		if (!amount || !productDescription) {
			return fail(400, { error: 'Amount and description are required' });
		}

		const amountNum = parseFloat(amount);
		if (isNaN(amountNum) || amountNum <= 0) {
			return fail(400, { error: 'Please enter a valid amount' });
		}

		// Verify remaining balance
		const [withdrawal] = await db
			.select({ amount: atmWithdrawals.amount })
			.from(atmWithdrawals)
			.where(eq(atmWithdrawals.id, params.id))
			.limit(1);

		const allocations = await db
			.select({ amount: withdrawalAllocations.amount })
			.from(withdrawalAllocations)
			.where(eq(withdrawalAllocations.withdrawalId, params.id));

		const totalAllocated = allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
		const remaining = parseFloat(withdrawal.amount) - totalAllocated;

		if (amountNum > remaining) {
			return fail(400, { error: `Amount exceeds remaining balance of $${remaining.toFixed(2)}` });
		}

		await db.insert(withdrawalAllocations).values({
			withdrawalId: params.id,
			amount: amountNum.toFixed(2),
			productDescription
		});

		// Update status
		const newRemaining = remaining - amountNum;
		const newStatus = newRemaining <= 0 ? 'fully_spent' : 'partially_assigned';

		await db
			.update(atmWithdrawals)
			.set({ status: newStatus, updatedAt: new Date() })
			.where(eq(atmWithdrawals.id, params.id));

		return { success: true };
	},

	delete: async ({ params, locals }) => {
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Unauthorized' });
		}

		await db.delete(atmWithdrawals).where(eq(atmWithdrawals.id, params.id));

		throw redirect(302, '/expenses');
	}
};
