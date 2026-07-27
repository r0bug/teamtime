// eBay Setup — where commissions get assigned and rates get set:
//   1. Consignors + consignment groups (the consignor's % of each sale)
//   2. Lister compensation (commission % of basis, or points per dollar)
// Settlement math lives in ebay-settlement-service; rate changes here only
// affect PENDING settlements on the next sync (approved rows are frozen).
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { asc, desc, eq, or } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { db, consignors, consignmentGroups, ebayListerSettings, users } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const allConsignors = await db.select().from(consignors).orderBy(desc(consignors.createdAt));
	const allGroups = await db.select().from(consignmentGroups).orderBy(desc(consignmentGroups.createdAt));

	// Staff-side users: listers are anyone flagged canListOnEbay or already
	// configured; the picker offers all active non-vendor users.
	const staff = await db
		.select({
			id: users.id,
			name: users.name,
			role: users.role,
			canListOnEbay: users.canListOnEbay
		})
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name));
	const settings = await db.select().from(ebayListerSettings);
	const settingsByUser = new Map(settings.map((s) => [s.userId, s]));

	return {
		consignors: allConsignors.map((c) => ({
			...c,
			groups: allGroups.filter((g) => g.consignorId === c.id)
		})),
		staff: staff.filter((s) => s.role !== 'purchaser' || s.canListOnEbay),
		listerSettings: staff
			.map((s) => ({ user: s, settings: settingsByUser.get(s.id) ?? null }))
			.filter((r) => r.user.canListOnEbay || r.settings)
	};
};
