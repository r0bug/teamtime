import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, atmWithdrawals } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { isPurchaser, isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	// Only purchasers and managers can access expenses
	if (!isPurchaser(user)) {
		throw redirect(302, '/dashboard');
	}

	const withdrawals = await db.query.atmWithdrawals.findMany({
		where: isManager(user) ? undefined : eq(atmWithdrawals.userId, user.id),
		orderBy: [desc(atmWithdrawals.withdrawnAt)],
		with: {
			user: { columns: { id: true, name: true } },
			allocations: true
		}
	});

	return { withdrawals };
};
