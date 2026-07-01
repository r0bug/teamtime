import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq, desc } from 'drizzle-orm';
import { db, pendingInventoryChanges } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';

/**
 * The payload jsonb is stored DOUBLE-ENCODED — a JSON string of a JSON string.
 * Reading `payload->>'x'` in SQL returns empty, so we read the column and parse
 * it in JS, parsing again if the first parse still yields a string.
 */
function parsePayload(raw: unknown): { description?: string; partName?: string; priceCents?: number } {
	let value: unknown = raw;
	for (let i = 0; i < 2 && typeof value === 'string'; i++) {
		try {
			value = JSON.parse(value);
		} catch {
			return {};
		}
	}
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * GET /api/vendor/inventory?q=<text>&limit=<n>
 * The calling vendor's created items (pendingInventoryChanges, changeType='create'),
 * deduped by partNumber keeping the most recent, filtered by q (case-insensitive
 * substring over partNumber / description / partName), newest first.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const q = url.searchParams.get('q')?.trim().toLowerCase() || '';

	const limitRaw = url.searchParams.get('limit');
	const limitParsed = limitRaw ? parseInt(limitRaw, 10) || 50 : 50;
	const limit = Math.max(1, Math.min(200, limitParsed));

	const rows = await db
		.select()
		.from(pendingInventoryChanges)
		.where(
			and(
				eq(pendingInventoryChanges.vendorId, vendor.id),
				eq(pendingInventoryChanges.changeType, 'create')
			)
		)
		.orderBy(desc(pendingInventoryChanges.submittedAt));

	// Dedupe by partNumber, keeping the most-recent submittedAt (rows are already
	// ordered newest-first, so the first occurrence wins).
	const byPart = new Map<
		string,
		{ partNumber: string; description: string | null; priceCents: number | null; submittedAt: Date }
	>();
	for (const r of rows) {
		if (byPart.has(r.partNumber)) continue;
		const p = parsePayload(r.payload);
		const description =
			typeof p.description === 'string' ? p.description : typeof p.partName === 'string' ? p.partName : null;
		const priceCents = typeof p.priceCents === 'number' ? p.priceCents : null;

		if (q) {
			const haystack = [
				r.partNumber,
				typeof p.description === 'string' ? p.description : '',
				typeof p.partName === 'string' ? p.partName : ''
			]
				.join(' ')
				.toLowerCase();
			if (!haystack.includes(q)) continue;
		}

		byPart.set(r.partNumber, {
			partNumber: r.partNumber,
			description,
			priceCents,
			submittedAt: r.submittedAt
		});
	}

	const items = Array.from(byPart.values())
		.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
		.slice(0, limit);

	return json({ items });
};
