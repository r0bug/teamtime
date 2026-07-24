import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, floorplanPools, type FloorplanPool } from '$lib/server/db';
import { getPlan, getAttrDefs, upsertAttrDef } from '$lib/server/floorplan/core';
import { canView } from '$lib/server/floorplan/permissions';

/**
 * Vendor pools: named groups of vendors for shared/in-store spaces. Cells are
 * painted with key 'pool' and the pool NAME as value; each save mirrors the
 * pool's color into the 'pool' attr def palette so the canvas can render it.
 * Operational config — any staff-side user may manage pools.
 */

/** drizzle 0.29 + postgres-js may return jsonb as a JSON string. */
function memberIds(pool: FloorplanPool): string[] {
	const raw = pool.vendorIds as unknown;
	if (Array.isArray(raw)) return raw.map(String);
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.map(String) : [];
		} catch {
			return [];
		}
	}
	return [];
}

function serialize(pool: FloorplanPool) {
	return { id: pool.id, name: pool.name, color: pool.color, vendorIds: memberIds(pool) };
}

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const pools = await db.select().from(floorplanPools).where(eq(floorplanPools.planId, plan.id));
	return json({ pools: pools.map(serialize) });
};

/** POST — create or update a pool. Body: { id?, name, color, vendorIds } */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	let body: { id?: unknown; name?: unknown; color?: unknown; vendorIds?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (name.length < 1 || name.length > 60) {
		return json({ error: 'name must be 1-60 characters' }, { status: 400 });
	}
	const color = typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;
	if (!color) return json({ error: 'color must be #rrggbb' }, { status: 400 });
	if (!Array.isArray(body.vendorIds) || !body.vendorIds.every((v) => typeof v === 'string' && /^\d+$/.test(v))) {
		return json({ error: 'vendorIds must be an array of NRS vendor id strings' }, { status: 400 });
	}
	const vendorIds = body.vendorIds as string[];

	let previousName: string | null = null;
	let saved: FloorplanPool;
	if (typeof body.id === 'string' && body.id) {
		const [existing] = await db
			.select()
			.from(floorplanPools)
			.where(and(eq(floorplanPools.planId, plan.id), eq(floorplanPools.id, body.id)))
			.limit(1);
		if (!existing) throw error(404, 'Pool not found');
		previousName = existing.name;
		[saved] = await db
			.update(floorplanPools)
			.set({ name, color, vendorIds, updatedAt: new Date() })
			.where(eq(floorplanPools.id, existing.id))
			.returning();
	} else {
		try {
			[saved] = await db.insert(floorplanPools).values({ planId: plan.id, name, color, vendorIds }).returning();
		} catch {
			return json({ error: `A pool named "${name}" already exists` }, { status: 400 });
		}
	}

	await syncPoolPalette(plan.id, { setName: name, setColor: color, dropName: previousName !== name ? previousName : null });
	return json({ pool: serialize(saved) });
};

/** DELETE ?id= — removes the pool definition. Painted 'pool' cells remain. */
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');
	const plan = await getPlan(params.planId);
	if (!plan) throw error(404, 'Plan not found');

	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'id query param is required' }, { status: 400 });
	const [existing] = await db
		.select()
		.from(floorplanPools)
		.where(and(eq(floorplanPools.planId, plan.id), eq(floorplanPools.id, id)))
		.limit(1);
	if (!existing) throw error(404, 'Pool not found');

	await db.delete(floorplanPools).where(eq(floorplanPools.id, existing.id));
	await syncPoolPalette(plan.id, { dropName: existing.name });
	return json({ ok: true });
};

/** Keep the 'pool' attr def + its palette in step with pool definitions. */
async function syncPoolPalette(
	planId: string,
	change: { setName?: string; setColor?: string; dropName?: string | null }
): Promise<void> {
	const defs = await getAttrDefs(planId);
	const def = defs.find((d) => d.key === 'pool');
	const renderHint = (def?.renderHint as { mode?: string; palette?: Record<string, string> } | null) ?? {};
	const palette = { ...(typeof renderHint.palette === 'object' ? renderHint.palette : {}) };
	if (change.dropName) delete palette[change.dropName];
	if (change.setName && change.setColor) palette[change.setName] = change.setColor;

	await upsertAttrDef(planId, {
		key: 'pool',
		type: def?.type ?? 'categorical',
		ownerSystem: def?.ownerSystem ?? 'floorplan',
		visibility: def?.visibility ?? 'public',
		renderHint: { mode: 'fill', palette }
	});
}
