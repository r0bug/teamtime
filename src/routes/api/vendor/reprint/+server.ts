import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq, desc } from 'drizzle-orm';
import { db, pendingInventoryChanges } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { enqueuePrintJob } from '$lib/server/services/print-queue-service';

/**
 * The payload jsonb is stored DOUBLE-ENCODED — a JSON string of a JSON string.
 * Read the column and parse it in JS, parsing again if it's still a string.
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
 * POST /api/vendor/reprint — re-queue a tag for an existing part number.
 *
 * Body: { "partNumber": string, "copies"?: number }
 * Looks up the vendor's most-recent create for that part to recover the
 * description/price, then enqueues a print job (source 'web_portal').
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	let body: { partNumber?: unknown; copies?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const partNumber = typeof body.partNumber === 'string' ? body.partNumber.trim() : '';
	if (!partNumber) return json({ error: 'partNumber is required' }, { status: 400 });

	let copies: number | undefined = undefined;
	if (body.copies !== undefined && body.copies !== null && body.copies !== '') {
		const c = parseInt(String(body.copies), 10);
		if (isFinite(c)) copies = c;
	}

	const [item] = await db
		.select()
		.from(pendingInventoryChanges)
		.where(
			and(
				eq(pendingInventoryChanges.vendorId, vendor.id),
				eq(pendingInventoryChanges.changeType, 'create'),
				eq(pendingInventoryChanges.partNumber, partNumber)
			)
		)
		.orderBy(desc(pendingInventoryChanges.submittedAt))
		.limit(1);

	const p = item ? parsePayload(item.payload) : {};
	const description =
		typeof p.description === 'string' ? p.description : typeof p.partName === 'string' ? p.partName : null;
	const priceCents = typeof p.priceCents === 'number' ? p.priceCents : null;

	const row = await enqueuePrintJob({
		vendorId: vendor.id,
		partNumber,
		copies: copies && copies > 0 ? copies : 1,
		description,
		priceCents,
		source: 'web_portal'
	});

	return json({ ok: true, jobId: row.id });
};
