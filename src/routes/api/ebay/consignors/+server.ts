import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc, eq } from 'drizzle-orm';
import { db, consignors, consignmentGroups } from '$lib/server/db';

function guard(locals: App.Locals) {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin' && u.role !== 'manager') return json({ error: 'Forbidden' }, { status: 403 });
	return null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const denied = guard(locals);
	if (denied) return denied;
	const rows = await db.select().from(consignors).orderBy(desc(consignors.createdAt));
	const groups = await db.select().from(consignmentGroups);
	return json({
		consignors: rows.map((c) => ({
			...c,
			groups: groups.filter((g) => g.consignorId === c.id)
		}))
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = guard(locals);
	if (denied) return denied;
	const body = (await request.json().catch(() => ({}))) as {
		type?: 'vendor' | 'estate' | 'walkin' | 'house';
		name?: string;
		vendorUserId?: string;
		phone?: string;
		email?: string;
		notes?: string;
	};
	if (!body.name?.trim()) return json({ error: 'name required' }, { status: 400 });
	const [row] = await db
		.insert(consignors)
		.values({
			type: body.type ?? 'walkin',
			name: body.name.trim(),
			vendorUserId: body.vendorUserId ?? null,
			phone: body.phone,
			email: body.email,
			notes: body.notes
		})
		.returning();
	return json(row, { status: 201 });
};
