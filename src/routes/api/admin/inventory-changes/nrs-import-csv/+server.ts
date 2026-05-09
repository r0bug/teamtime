import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { buildNrsImportCsv } from '$lib/server/services/inventory-change-service';

/**
 * GET /api/admin/inventory-changes/nrs-import-csv?vendorId=...&changeType=create
 *
 * Returns a CSV matching the NRS ImportInv template, with pending changes as
 * rows. Staff downloads this and uploads it to NRS's Importer page.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const vendorId = url.searchParams.get('vendorId') ?? undefined;
	const changeTypeParam = url.searchParams.get('changeType');
	const changeType =
		changeTypeParam === 'update' || changeTypeParam === 'delete'
			? changeTypeParam
			: 'create';

	const result = await buildNrsImportCsv({ vendorId: vendorId || undefined, changeType });

	const today = new Date().toISOString().slice(0, 10);
	const slug = result.vendorCode ?? (vendorId ? 'vendor' : 'all');
	const filename = `nrs-import-${slug}-${today}.csv`;

	return new Response(result.csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'X-Row-Count': String(result.rowCount),
			'X-Change-Ids': result.changeIds.join(',')
		}
	});
};
