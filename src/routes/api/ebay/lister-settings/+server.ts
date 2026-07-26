import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, ebayListerSettings, users } from '$lib/server/db';

function guard(locals: App.Locals) {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin' && u.role !== 'manager') return json({ error: 'Forbidden' }, { status: 403 });
	return null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const denied = guard(locals);
	if (denied) return denied;
	const rows = await db
		.select({
			userId: users.id,
			name: users.name,
			canListOnEbay: users.canListOnEbay,
			settings: ebayListerSettings
		})
		.from(users)
		.leftJoin(ebayListerSettings, eq(ebayListerSettings.userId, users.id))
		.where(eq(users.isActive, true));
	return json({ listers: rows.filter((r) => r.canListOnEbay || r.settings) });
};

/** Upsert one lister's comp settings. Commission % is of pre-tax basis,
 *  carved out of the YF share; points/dollar feeds the gamification ledger. */
export const PUT: RequestHandler = async ({ locals, request }) => {
	const denied = guard(locals);
	if (denied) return denied;
	const body = (await request.json().catch(() => ({}))) as {
		userId?: string;
		compType?: 'commission' | 'points' | 'none';
		commissionPercent?: number | null;
		pointsPerDollar?: number | null;
		isActive?: boolean;
	};
	if (!body.userId || !body.compType) {
		return json({ error: 'userId + compType required' }, { status: 400 });
	}
	if (body.compType === 'commission' && (body.commissionPercent == null || body.commissionPercent < 0 || body.commissionPercent > 100)) {
		return json({ error: 'commissionPercent (0-100) required for commission comp' }, { status: 400 });
	}
	const values = {
		userId: body.userId,
		compType: body.compType,
		commissionPercent: body.commissionPercent != null ? String(body.commissionPercent) : null,
		pointsPerDollar: body.pointsPerDollar != null ? String(body.pointsPerDollar) : '1.000',
		isActive: body.isActive ?? true,
		updatedAt: new Date()
	};
	const [row] = await db
		.insert(ebayListerSettings)
		.values(values)
		.onConflictDoUpdate({ target: ebayListerSettings.userId, set: values })
		.returning();
	return json(row);
};
