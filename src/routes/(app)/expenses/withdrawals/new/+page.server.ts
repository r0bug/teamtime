import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db, atmWithdrawals } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	return {};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const amount = formData.get('amount')?.toString();
		const withdrawnAt = formData.get('withdrawnAt')?.toString();
		const address = formData.get('address')?.toString() || null;
		const notes = formData.get('notes')?.toString() || null;

		if (!amount || !withdrawnAt) {
			return fail(400, { error: 'Amount and withdrawal date are required' });
		}

		const amountNum = parseFloat(amount);
		if (isNaN(amountNum) || amountNum <= 0) {
			return fail(400, { error: 'Please enter a valid amount' });
		}

		await db.insert(atmWithdrawals).values({
			userId: locals.user.id,
			amount: amountNum.toFixed(2),
			withdrawnAt: new Date(withdrawnAt),
			address,
			notes,
			status: 'unassigned'
		});

		throw redirect(302, '/expenses');
	}
};
