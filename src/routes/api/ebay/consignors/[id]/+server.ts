import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, consignors } from '$lib/server/db';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const u = locals.user;
	if (!u) return json({ error: 'Not signed in' }, { status: 401 });
	if (u.role !== 'admin' && u.role !== 'manager') return json({ error: 'Forbidden' }, { status: 403 });
	const body = (await request.json().catch(() => ({}))) as Partial<{
		type: 'vendor' | 'estate' | 'walkin' | 'house';
		name: string;
		vendorUserId: string | null;
		phone: string | null;
		email: string | null;
		notes: string | null;
		isActive: boolean;
	}>;
	const [row] = await db
		.update(consignors)
		.set({ ...body, updatedAt: new Date() })
		.where(eq(consignors.id, params.id))
		.returning();
	if (!row) return json({ error: 'Not found' }, { status: 404 });
	return json(row);
};
