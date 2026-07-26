import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc } from 'drizzle-orm';
import { db, consignmentGroups } from '$lib/server/db';

function guard(locals: App.Locals) {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin' && u.role !== 'manager') return json({ error: 'Forbidden' }, { status: 403 });
	return null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const denied = guard(locals);
	if (denied) return denied;
	const rows = await db.select().from(consignmentGroups).orderBy(desc(consignmentGroups.createdAt));
	return json({ groups: rows });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = guard(locals);
	if (denied) return denied;
	const body = (await request.json().catch(() => ({}))) as {
		consignorId?: string;
		name?: string;
		code?: string;
		consignorPercent?: number;
		notes?: string;
	};
	if (!body.consignorId || !body.name?.trim() || body.consignorPercent == null) {
		return json({ error: 'consignorId, name, consignorPercent required' }, { status: 400 });
	}
	if (body.consignorPercent < 0 || body.consignorPercent > 100) {
		return json({ error: 'consignorPercent must be 0-100' }, { status: 400 });
	}
	const [row] = await db
		.insert(consignmentGroups)
		.values({
			consignorId: body.consignorId,
			name: body.name.trim(),
			code: body.code?.trim() || null,
			consignorPercent: String(body.consignorPercent),
			notes: body.notes
		})
		.returning();
	return json(row, { status: 201 });
};
