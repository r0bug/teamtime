// Monthly booth archive (floorplan_booth_history): who occupied how much
// space at what rent and commission, month by month. Feeds the revenue
// calculator's what-ifs for vendors who have left or changed size.
//
// capture()  — upsert this month's rows from the live floorplan + vendor
//              records. Idempotent; the month's row always reflects the
//              latest capture. Called by the floorplan cron, after floorplan
//              saves, and from the calculator's "Capture now" button.
// backfill() — for months with no rows yet, derive booths from the newest
//              manual/auto floorplan snapshot saved in that month, with the
//              vendors' CURRENT rent/commission (no rent history exists
//              before the archive started). Runs once, inside capture().

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
	db,
	vendors,
	floorplanPlans,
	floorplanCellAttrs,
	floorplanPools,
	floorplanSnapshots,
	floorplanBoothHistory,
	type FloorplanBoothHistory
} from '$lib/server/db';
import { getPacificDateParts } from '$lib/server/utils/timezone';
import { buildBooths, type BoothDef } from './revenue-trends';
import { createLogger } from '$lib/server/logger';
import { loadPayoutGroups } from '$lib/server/services/payout-group-service';

const log = createLogger('floorplan:booth-history');

export type CaptureSource = 'cron' | 'save' | 'manual' | 'backfill';

export function currentMonth(now: Date = new Date()): string {
	const { year, month } = getPacificDateParts(now);
	return `${year}-${String(month).padStart(2, '0')}`;
}

type VendorRow = {
	nrsVendorId: number;
	displayName: string;
	code: string | null;
	monthlyRentCents: number | null;
	vendorPaymentPercent: string | null;
};

async function loadVendorRows(): Promise<VendorRow[]> {
	const rows = await db
		.select({
			nrsVendorId: vendors.nrsVendorId,
			displayName: vendors.displayName,
			code: vendors.inventoryCodePrefix,
			monthlyRentCents: vendors.monthlyRentCents,
			vendorPaymentPercent: vendors.vendorPaymentPercent
		})
		.from(vendors)
		.where(sql`${vendors.nrsVendorId} IS NOT NULL`);
	return rows.map((r) => ({ ...r, nrsVendorId: r.nrsVendorId! }));
}

/** Store commission (0-100) for a booth: 100 − mean vendor payment % of members that have one. */
export function boothCommission(booth: BoothDef, byId: Map<number, VendorRow>): number | null {
	const pcts = booth.vendorIds
		.map((id) => byId.get(id)?.vendorPaymentPercent)
		.filter((p): p is string => p !== null && p !== undefined)
		.map(Number)
		.filter((n) => Number.isFinite(n));
	if (pcts.length === 0) return null;
	const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
	return Math.round((100 - mean) * 100) / 100;
}

async function upsertMonth(month: string, booths: BoothDef[], byId: Map<number, VendorRow>, source: CaptureSource): Promise<number> {
	if (booths.length === 0) return 0;
	const now = new Date();
	const values = booths.map((b) => {
		const commission = boothCommission(b, byId);
		return {
			month,
			boothKey: b.key,
			label: b.label,
			names: b.names,
			vendorIds: b.vendorIds,
			shared: b.shared,
			sqft: b.sqft,
			rentCents: Math.round(b.rent * 100),
			commissionPercent: commission === null ? null : String(commission),
			source,
			capturedAt: now
		};
	});
	await db
		.insert(floorplanBoothHistory)
		.values(values)
		.onConflictDoUpdate({
			target: [floorplanBoothHistory.month, floorplanBoothHistory.boothKey],
			set: {
				label: sql`excluded.label`,
				names: sql`excluded.names`,
				vendorIds: sql`excluded.vendor_ids`,
				shared: sql`excluded.shared`,
				sqft: sql`excluded.sqft`,
				rentCents: sql`excluded.rent_cents`,
				commissionPercent: sql`excluded.commission_percent`,
				source: sql`excluded.source`,
				capturedAt: sql`excluded.captured_at`
			}
		});
	// Booths that vanished within the month (vendor moved out mid-month) keep
	// their row only if they still had cells at the last capture — remove the
	// rest so the month reflects end-of-month occupancy.
	const keys = booths.map((b) => b.key);
	await db
		.delete(floorplanBoothHistory)
		.where(and(eq(floorplanBoothHistory.month, month), sql`${floorplanBoothHistory.boothKey} NOT IN ${keys}`));
	return values.length;
}

/** Current booths from the live floorplan (all plans), plus the vendor lookup. */
export async function liveBooths(): Promise<{ booths: BoothDef[]; byId: Map<number, VendorRow> }> {
	const plans = await db.select({ id: floorplanPlans.id }).from(floorplanPlans);
	const vendorRows = await loadVendorRows();
	const byId = new Map(vendorRows.map((v) => [v.nrsVendorId, v]));
	if (plans.length === 0) return { booths: [], byId };
	const planIds = plans.map((p) => p.id);
	const [cellRows, pools] = await Promise.all([
		db
			.select({ x: floorplanCellAttrs.x, y: floorplanCellAttrs.y, key: floorplanCellAttrs.key, value: floorplanCellAttrs.value })
			.from(floorplanCellAttrs)
			.where(and(inArray(floorplanCellAttrs.planId, planIds), inArray(floorplanCellAttrs.key, ['vendor_id', 'pool']))),
		db.select({ name: floorplanPools.name, vendorIds: floorplanPools.vendorIds }).from(floorplanPools)
	]);
	return { booths: buildBooths(vendorRows, cellRows, pools, await loadPayoutGroups()), byId };
}

/**
 * Fill months that have no archive rows from saved floorplan snapshots
 * (newest snapshot in each month wins). Only runs while the archive is
 * empty for those months, so a real capture is never overwritten.
 */
export async function backfillFromSnapshots(): Promise<{ months: string[] }> {
	const snaps = await db
		.select({
			id: floorplanSnapshots.id,
			createdAt: floorplanSnapshots.createdAt,
			cells: floorplanSnapshots.cells
		})
		.from(floorplanSnapshots)
		.orderBy(asc(floorplanSnapshots.createdAt));
	if (snaps.length === 0) return { months: [] };

	const have = new Set(
		(await db.selectDistinct({ month: floorplanBoothHistory.month }).from(floorplanBoothHistory)).map((r) => r.month)
	);
	const thisMonth = currentMonth();
	// newest snapshot per month (ascending order → later overwrites)
	const byMonth = new Map<string, (typeof snaps)[number]>();
	for (const s of snaps) {
		const m = currentMonth(s.createdAt);
		if (m === thisMonth || have.has(m)) continue;
		byMonth.set(m, s);
	}
	if (byMonth.size === 0) return { months: [] };

	const vendorRows = await loadVendorRows();
	const byId = new Map(vendorRows.map((v) => [v.nrsVendorId, v]));
	const pools = await db.select({ name: floorplanPools.name, vendorIds: floorplanPools.vendorIds }).from(floorplanPools);
	const maps = await loadPayoutGroups();
	const months: string[] = [];
	for (const [month, snap] of byMonth) {
		const cells = (Array.isArray(snap.cells) ? snap.cells : []).filter((c) => c.key === 'vendor_id' || c.key === 'pool');
		const booths = buildBooths(vendorRows, cells, pools, maps);
		await upsertMonth(month, booths, byId, 'backfill');
		months.push(month);
	}
	months.sort();
	log.info({ months }, 'Backfilled booth history from floorplan snapshots');
	return { months };
}

/** Upsert this month's archive rows from the live floorplan. */
export async function captureBoothHistory(source: CaptureSource = 'cron'): Promise<{ month: string; booths: number; backfilled: string[] }> {
	const { months: backfilled } = await backfillFromSnapshots();
	const { booths, byId } = await liveBooths();
	const month = currentMonth();
	const n = await upsertMonth(month, booths, byId, source);
	log.info({ month, booths: n, source }, 'Captured booth history');
	return { month, booths: n, backfilled };
}

/** Fire-and-forget variant for request paths (floorplan saves). */
export function captureBoothHistoryInBackground(source: CaptureSource): void {
	void captureBoothHistory(source).catch((err) => log.error({ err }, 'Booth history capture failed'));
}

export interface BoothHistoryMonth {
	month: string;
	sqft: number;
	rent: number;
	commissionPercent: number | null;
	source: string;
}

/** All archive rows grouped by booth key, months ascending. */
export async function loadBoothHistory(): Promise<Map<string, { latest: FloorplanBoothHistory; months: BoothHistoryMonth[] }>> {
	const rows = await db.select().from(floorplanBoothHistory).orderBy(asc(floorplanBoothHistory.month), desc(floorplanBoothHistory.capturedAt));
	const out = new Map<string, { latest: FloorplanBoothHistory; months: BoothHistoryMonth[] }>();
	for (const r of rows) {
		const entry = out.get(r.boothKey) ?? { latest: r, months: [] };
		entry.latest = r; // ascending month order → last row is the latest month
		entry.months.push({
			month: r.month,
			sqft: r.sqft,
			rent: r.rentCents / 100,
			commissionPercent: r.commissionPercent === null ? null : Number(r.commissionPercent),
			source: r.source
		});
		out.set(r.boothKey, entry);
	}
	return out;
}
