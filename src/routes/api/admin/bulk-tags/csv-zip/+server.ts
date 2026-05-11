import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import archiver from 'archiver';
import {
	db,
	vendors,
	pendingInventoryChanges,
	type PendingInventoryChange
} from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { buildNrsCsvFromChangeRows } from '$lib/server/services/inventory-change-service';

/**
 * GET /api/admin/bulk-tags/csv-zip?changeIds=id1,id2,...
 *
 * Returns a zip with one NRS ImportInv CSV per vendor — each file is directly
 * uploadable to the NRS Importer page. Staff downloads this after the bulk
 * tag designer has minted the part numbers.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const raw = url.searchParams.get('changeIds') ?? '';
	const ids = raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (ids.length === 0) throw error(400, 'changeIds is required');
	if (ids.length > 1000) throw error(400, 'Too many ids');

	const changes = await db
		.select()
		.from(pendingInventoryChanges)
		.where(inArray(pendingInventoryChanges.id, ids));
	if (changes.length === 0) throw error(404, 'No matching changes found');

	const vendorIds = Array.from(new Set(changes.map((c) => c.vendorId)));
	const vendorRows = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			inventoryCodePrefix: vendors.inventoryCodePrefix
		})
		.from(vendors)
		.where(inArray(vendors.id, vendorIds));
	const vendorById = new Map(vendorRows.map((v) => [v.id, v]));

	// Group changes by vendor
	const byVendor = new Map<string, PendingInventoryChange[]>();
	for (const c of changes) {
		const list = byVendor.get(c.vendorId) ?? [];
		list.push(c);
		byVendor.set(c.vendorId, list);
	}

	const archive = archiver('zip', { zlib: { level: 9 } });
	const chunks: Buffer[] = [];
	archive.on('data', (chunk: Buffer) => chunks.push(chunk));
	const finished = new Promise<void>((resolve, reject) => {
		archive.on('end', () => resolve());
		archive.on('error', (err) => reject(err));
	});

	const today = new Date().toISOString().slice(0, 10);
	for (const [vendorId, vendorChanges] of byVendor) {
		const v = vendorById.get(vendorId);
		if (!v) continue;
		const csv = buildNrsCsvFromChangeRows(
			vendorChanges.map((change) => ({ change, vendorDisplayName: v.displayName }))
		);
		const slug = (v.inventoryCodePrefix ?? 'vendor').toLowerCase().replace(/[^a-z0-9]+/g, '-');
		const filename = `nrs-import-${slug}-${today}.csv`;
		archive.append(csv, { name: filename });
	}

	await archive.finalize();
	await finished;
	const zipBuffer = Buffer.concat(chunks);

	return new Response(zipBuffer, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="bulk-tags-${today}.zip"`,
			'Cache-Control': 'no-store'
		}
	});
};
