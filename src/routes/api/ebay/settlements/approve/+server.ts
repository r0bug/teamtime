import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { approveSettlements } from '$lib/server/services/ebay-settlement-service';

/** Freeze pending settlements (terms snapshot becomes history). Admin only. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });
	const body = (await request.json().catch(() => ({}))) as { period?: string; ids?: string[] };
	if (!body.period && !body.ids?.length) {
		return json({ error: 'period or ids required' }, { status: 400 });
	}
	const approved = await approveSettlements(body);
	return json({ approved });
};
