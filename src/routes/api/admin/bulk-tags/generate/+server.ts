import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	generatePartNumber,
	VendorServiceError
} from '$lib/server/services/vendor-service';
import {
	submitChange,
	InventoryChangeError
} from '$lib/server/services/inventory-change-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:bulk-tags');

interface InputRow {
	vendorId: string;
	description: string;
	priceDollars: number | string;
	copies?: number;
}

interface GeneratedRow {
	rowIndex: number;
	changeId: string;
	partNumber: string;
	vendorId: string;
	description: string;
	priceCents: number;
	copies: number;
}

/**
 * POST /api/admin/bulk-tags/generate
 *
 * Body: { rows: InputRow[] }
 *
 * For each row, generates a part number for the row's vendor (incrementing
 * the vendor's daily counter) and queues a pending inventory change. Returns
 * the freshly minted part numbers + their change IDs so the client can then
 * render the sheet and download the per-vendor CSV zip.
 *
 * Rows are processed sequentially because `generatePartNumber` mutates a
 * (vendorId, dateStr) counter — sequential is the safest path against an
 * accidentally-batched onConflict path.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	if (!locals.user) throw error(401, 'Not signed in');

	const body = (await request.json()) as { rows?: InputRow[] };
	const inputRows = Array.isArray(body?.rows) ? body.rows : [];
	if (inputRows.length === 0) throw error(400, 'No rows supplied');
	if (inputRows.length > 500) throw error(400, 'Too many rows (max 500 per submission)');

	const generated: GeneratedRow[] = [];
	for (let i = 0; i < inputRows.length; i++) {
		const r = inputRows[i];
		const desc = String(r.description ?? '').trim();
		const priceNum = Number(r.priceDollars);
		const priceCents = Number.isFinite(priceNum) ? Math.round(priceNum * 100) : NaN;
		const copies = Math.max(1, Math.min(Number(r.copies ?? 1) | 0, 100));

		if (!r.vendorId) throw error(400, `Row ${i + 1}: vendor is required`);
		if (!desc) throw error(400, `Row ${i + 1}: description is required`);
		if (!Number.isFinite(priceCents) || priceCents < 0) {
			throw error(400, `Row ${i + 1}: price must be a non-negative number`);
		}

		let partNumber: string;
		try {
			partNumber = await generatePartNumber(r.vendorId);
		} catch (err) {
			if (err instanceof VendorServiceError) throw error(400, `Row ${i + 1}: ${err.message}`);
			throw err;
		}

		try {
			const change = await submitChange({
				vendorId: r.vendorId,
				submittedByUserId: locals.user.id,
				changeType: 'create',
				partNumber,
				payload: { partName: desc, description: desc, priceCents }
			});
			generated.push({
				rowIndex: i,
				changeId: change.id,
				partNumber,
				vendorId: r.vendorId,
				description: desc,
				priceCents,
				copies
			});
		} catch (err) {
			if (err instanceof InventoryChangeError) {
				throw error(400, `Row ${i + 1}: ${err.message}`);
			}
			throw err;
		}
	}

	log.info(
		{ userId: locals.user.id, count: generated.length },
		'Staff bulk-tags: generated changes'
	);

	return json({ generated });
};
