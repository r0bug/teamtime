import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db, vendors, floorplanPools } from '$lib/server/db';
import { listPlans, getAttrDefs, queryCells } from '$lib/server/floorplan/core';
import { canView, viewerRank, filterAttrsByRank, defsByKey } from '$lib/server/floorplan/permissions';
import { loadPayoutGroups, rollupNrsId } from '$lib/server/services/payout-group-service';
import { renderWorksheetPdf } from '$lib/server/floorplan/worksheet-pdf';

/**
 * GET /floorplan/print/pdf?plan=&zone=&range=x1,y1-x2,y2&paper=letter|legal|tabloid
 *   &cpi=<cells per inch, 0 = fit>&shade=vendor|zone|kind|none&labels=1&coords=1&margin=0.2
 * The worksheet as a landscape PDF that fills the page; the selection comes
 * from the URL so what the page shows is exactly what prints.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!canView(locals.user)) throw error(403, 'Forbidden');

	const plans = await listPlans();
	const planId = url.searchParams.get('plan') ?? plans[0]?.id;
	const plan = plans.find((p) => p.id === planId);
	if (!plan) throw error(404, 'Plan not found');

	const rank = viewerRank(locals.user);
	const byKey = defsByKey(await getAttrDefs(plan.id));
	const maps = await loadPayoutGroups();
	const cells = (await queryCells(plan.id, []))
		.map((c) => {
			const attrs = filterAttrsByRank(c.attrs, byKey, rank);
			if (attrs.vendor_id && /^\d+$/.test(attrs.vendor_id)) attrs.vendor_id = String(rollupNrsId(maps, Number(attrs.vendor_id)));
			return { x: c.x, y: c.y, attrs };
		})
		.filter((c) => Object.keys(c.attrs).length > 0);

	const ids = [...new Set(cells.map((c) => c.attrs.vendor_id).filter((v): v is string => !!v && /^\d+$/.test(v)))].map(Number);
	const vendorRows = ids.length
		? await db.select({ nrsVendorId: vendors.nrsVendorId, displayName: vendors.displayName, code: vendors.inventoryCodePrefix }).from(vendors).where(sql`${vendors.nrsVendorId} IN ${ids}`)
		: [];
	const vendorsById: Record<string, { code: string | null; name: string }> = {};
	for (const v of vendorRows) vendorsById[String(v.nrsVendorId)] = { code: v.code, name: v.displayName };
	const pools = await db.select({ name: floorplanPools.name, color: floorplanPools.color }).from(floorplanPools).where(and(eq(floorplanPools.planId, plan.id)));
	const zoneDef = byKey.get('zone') as { renderHint?: { palette?: Record<string, string> | 'auto' } | null } | undefined;
	const zp = zoneDef?.renderHint?.palette;
	const zonePalette = zp && typeof zp === 'object' ? zp : null;

	// Section: explicit range, else a zone's bounding box, else everything painted (+1 cell border).
	const zone = url.searchParams.get('zone') ?? '';
	const range = (url.searchParams.get('range') ?? '').match(/^\s*(\d+)\s*,\s*(\d+)\s*-\s*(\d+)\s*,\s*(\d+)\s*$/);
	let section: { minX: number; minY: number; maxX: number; maxY: number };
	let sectionLabel = '';
	if (range) {
		const [x1, y1, x2, y2] = [range[1], range[2], range[3], range[4]].map(Number);
		section = { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.min(plan.gridW - 1, Math.max(x1, x2)), maxY: Math.min(plan.gridH - 1, Math.max(y1, y2)) };
		sectionLabel = `cells ${section.minX},${section.minY}-${section.maxX},${section.maxY}`;
	} else {
		const pool = zone ? cells.filter((c) => c.attrs.zone === zone) : cells;
		if (pool.length === 0) throw error(404, zone ? `No cells in zone "${zone}"` : 'Nothing painted on this plan');
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const c of pool) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); }
		section = { minX: Math.max(0, minX - 1), minY: Math.max(0, minY - 1), maxX: Math.min(plan.gridW - 1, maxX + 1), maxY: Math.min(plan.gridH - 1, maxY + 1) };
		sectionLabel = zone ? `zone ${zone}` : '';
	}
	if (section.maxX < section.minX || section.maxY < section.minY) throw error(400, 'Empty section');

	const paperRaw = url.searchParams.get('paper');
	const paper = paperRaw === 'legal' || paperRaw === 'tabloid' ? paperRaw : 'letter';
	const shadeRaw = url.searchParams.get('shade');
	const shade = shadeRaw === 'zone' || shadeRaw === 'kind' || shadeRaw === 'none' ? shadeRaw : 'vendor';
	const cpi = Math.max(0, Math.min(12, Number(url.searchParams.get('cpi') ?? 0) || 0));
	const marginIn = Math.max(0.1, Math.min(1, Number(url.searchParams.get('margin') ?? 0.2) || 0.2));

	const pdf = renderWorksheetPdf({
		planName: plan.name,
		cells,
		vendorsById,
		pools,
		zonePalette,
		section,
		sectionLabel,
		paper,
		cellsPerInch: cpi,
		shade,
		labels: url.searchParams.get('labels') !== '0',
		coords: url.searchParams.get('coords') !== '0',
		marginIn,
		printedBy: locals.user.name ?? ''
	});
	const name = `floorplan-worksheet-${sectionLabel ? sectionLabel.replace(/[^a-z0-9-]+/gi, '_') : 'all'}.pdf`;
	return new Response(new Uint8Array(pdf), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${name}"`,
			'Cache-Control': 'no-store'
		}
	});
};
