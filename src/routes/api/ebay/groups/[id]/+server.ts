import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, consignmentGroups } from '$lib/server/db';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin' && u.role !== 'manager') return json({ error: 'Forbidden' }, { status: 403 });
	const body = (await request.json().catch(() => ({}))) as Partial<{
		name: string;
		code: string | null;
		consignorPercent: number;
		notes: string | null;
		isActive: boolean;
	}>;
	// NOTE: changing consignorPercent only affects PENDING settlements on the
	// next sync — approved/exported rows keep their snapshot (Standards §3).
	const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
	if (body.consignorPercent != null) patch.consignorPercent = String(body.consignorPercent);
	const [row] = await db
		.update(consignmentGroups)
		.set(patch)
		.where(eq(consignmentGroups.id, params.id))
		.returning();
	if (!row) return json({ error: 'Not found' }, { status: 404 });
	return json(row);
};
