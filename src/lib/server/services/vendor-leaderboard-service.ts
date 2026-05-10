/**
 * Vendor leaderboard / performance ranking.
 *
 * NRS is the source of truth for sales, but the existing hourly import job
 * already populates `salesSnapshots.vendors[]` (per-vendor daily aggregates
 * keyed by NRS vendorId). Reading from that table for the leaderboard avoids
 * hammering the NRS API on every page load — freshness is bounded by the
 * import cadence (hourly), which is fine for a ranking view.
 *
 * The leaderboard joins those NRS-keyed aggregates back to the TT `vendors`
 * table by `nrsVendorId` so we can show booth #, status, etc. Vendors that
 * have no TT row yet still rank — they appear with their NRS name.
 */

import { and, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { salesSnapshots, vendors } from '$lib/server/db/schema';

export type LeaderboardMetric = 'gross' | 'vendorPortion' | 'retained';
export type LeaderboardPeriod = '7d' | '30d' | 'mtd' | 'ytd' | 'custom';

export interface LeaderboardRow {
	rank: number;
	nrsVendorId: number;
	nrsVendorName: string;
	// TT-side fields, present only when the vendor has been imported into TT
	vendorId: string | null;
	displayName: string | null;
	boothNumber: string | null;
	status: 'active' | 'inactive' | 'terminated' | null;
	// Aggregate metrics for the selected period
	totalGross: number;
	totalVendorPortion: number;
	totalRetained: number;
	daysWithSales: number;
	// Optional comparison to the prior period of equal length
	priorTotal: number | null;
	deltaPercent: number | null;
}

export interface LeaderboardResult {
	rows: LeaderboardRow[];
	metric: LeaderboardMetric;
	period: { start: string; end: string };
	priorPeriod: { start: string; end: string } | null;
	totals: {
		gross: number;
		vendorPortion: number;
		retained: number;
		vendorCount: number;
	};
}

interface SnapshotVendor {
	vendor_id: string;
	vendor_name: string;
	total_sales: number;
	vendor_amount: number;
	retained_amount: number;
}

interface AggRow {
	totalGross: number;
	totalVendorPortion: number;
	totalRetained: number;
	daysWithSales: number;
	nrsVendorName: string;
}

export async function computeLeaderboard(input: {
	startDate: string; // YYYY-MM-DD
	endDate: string;   // YYYY-MM-DD inclusive
	metric: LeaderboardMetric;
	includePriorPeriod?: boolean;
	limit?: number;
}): Promise<LeaderboardResult> {
	const { startDate, endDate, metric } = input;

	const current = await aggregate(startDate, endDate);

	let priorWindow: { start: string; end: string } | null = null;
	let prior: Map<number, AggRow> | null = null;
	if (input.includePriorPeriod) {
		priorWindow = priorRange(startDate, endDate);
		prior = await aggregate(priorWindow.start, priorWindow.end);
	}

	const ids = Array.from(current.keys());
	const ttVendors = ids.length
		? await db
				.select({
					id: vendors.id,
					nrsVendorId: vendors.nrsVendorId,
					displayName: vendors.displayName,
					boothNumber: vendors.boothNumber,
					status: vendors.status
				})
				.from(vendors)
				.where(inArray(vendors.nrsVendorId, ids))
		: [];

	const ttByNrsId = new Map<number, (typeof ttVendors)[number]>();
	for (const v of ttVendors) {
		if (v.nrsVendorId !== null) ttByNrsId.set(v.nrsVendorId, v);
	}

	const rows: Omit<LeaderboardRow, 'rank'>[] = [];
	for (const [nrsVendorId, agg] of current.entries()) {
		const tt = ttByNrsId.get(nrsVendorId) ?? null;
		const priorAgg = prior?.get(nrsVendorId);
		const priorTotal = priorAgg ? metricValue(priorAgg, metric) : null;
		const currentTotal = metricValue(agg, metric);
		const deltaPercent = computeDelta(currentTotal, priorTotal);

		rows.push({
			nrsVendorId,
			nrsVendorName: agg.nrsVendorName,
			vendorId: tt?.id ?? null,
			displayName: tt?.displayName ?? null,
			boothNumber: tt?.boothNumber ?? null,
			status: tt?.status ?? null,
			totalGross: round2(agg.totalGross),
			totalVendorPortion: round2(agg.totalVendorPortion),
			totalRetained: round2(agg.totalRetained),
			daysWithSales: agg.daysWithSales,
			priorTotal: priorTotal !== null ? round2(priorTotal) : null,
			deltaPercent
		});
	}

	rows.sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
	const limited = input.limit ? rows.slice(0, input.limit) : rows;
	const ranked: LeaderboardRow[] = limited.map((r, i) => ({ ...r, rank: i + 1 }));

	const totals = {
		gross: round2(rows.reduce((s, r) => s + r.totalGross, 0)),
		vendorPortion: round2(rows.reduce((s, r) => s + r.totalVendorPortion, 0)),
		retained: round2(rows.reduce((s, r) => s + r.totalRetained, 0)),
		vendorCount: rows.length
	};

	return {
		rows: ranked,
		metric,
		period: { start: startDate, end: endDate },
		priorPeriod: priorWindow,
		totals
	};
}

async function aggregate(startDate: string, endDate: string): Promise<Map<number, AggRow>> {
	const snapshots = await db
		.select({
			vendors: salesSnapshots.vendors,
			// Cast to text — postgres-js returns `date` columns as JS Date,
			// which breaks Map<string, …> dedup by saleDate.
			saleDate: sql<string>`TO_CHAR(${salesSnapshots.saleDate}, 'YYYY-MM-DD')`
		})
		.from(salesSnapshots)
		.where(and(gte(salesSnapshots.saleDate, startDate), lte(salesSnapshots.saleDate, endDate)));

	// If multiple snapshots exist for the same date, prefer the latest one.
	// salesSnapshots can be re-imported; we want the freshest aggregate per day.
	const latestByDate = new Map<string, SnapshotVendor[]>();
	for (const s of snapshots) {
		latestByDate.set(s.saleDate, s.vendors as SnapshotVendor[]);
	}

	const agg = new Map<number, AggRow>();
	for (const dayVendors of latestByDate.values()) {
		for (const v of dayVendors) {
			const id = parseInt(v.vendor_id, 10);
			if (!Number.isFinite(id) || id === 0) continue;
			const existing = agg.get(id);
			if (existing) {
				existing.totalGross += v.total_sales ?? 0;
				existing.totalVendorPortion += v.vendor_amount ?? 0;
				existing.totalRetained += v.retained_amount ?? 0;
				existing.daysWithSales += 1;
			} else {
				agg.set(id, {
					totalGross: v.total_sales ?? 0,
					totalVendorPortion: v.vendor_amount ?? 0,
					totalRetained: v.retained_amount ?? 0,
					daysWithSales: 1,
					nrsVendorName: v.vendor_name || `NRS #${id}`
				});
			}
		}
	}
	return agg;
}

function metricValue(agg: { totalGross: number; totalVendorPortion: number; totalRetained: number }, metric: LeaderboardMetric): number {
	switch (metric) {
		case 'gross': return agg.totalGross;
		case 'vendorPortion': return agg.totalVendorPortion;
		case 'retained': return agg.totalRetained;
	}
}

function priorRange(startDate: string, endDate: string): { start: string; end: string } {
	const start = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');
	const lengthMs = end.getTime() - start.getTime();
	const priorEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
	const priorStart = new Date(priorEnd.getTime() - lengthMs);
	return {
		start: priorStart.toISOString().slice(0, 10),
		end: priorEnd.toISOString().slice(0, 10)
	};
}

function computeDelta(current: number, prior: number | null): number | null {
	if (prior === null) return null;
	if (prior === 0) return current > 0 ? 100 : 0;
	return ((current - prior) / prior) * 100;
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * Resolve a {@link LeaderboardPeriod} preset to an explicit date range.
 * Pacific time, since that's how the rest of the app handles dates.
 */
export function resolvePeriod(period: LeaderboardPeriod, customStart?: string, customEnd?: string): { start: string; end: string } {
	if (period === 'custom') {
		if (!customStart || !customEnd) throw new Error('custom period requires start and end');
		return { start: customStart, end: customEnd };
	}

	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date()); // YYYY-MM-DD

	const end = today;
	const endDt = new Date(end + 'T00:00:00Z');
	let start: string;

	switch (period) {
		case '7d': {
			const d = new Date(endDt);
			d.setUTCDate(d.getUTCDate() - 6);
			start = d.toISOString().slice(0, 10);
			break;
		}
		case '30d': {
			const d = new Date(endDt);
			d.setUTCDate(d.getUTCDate() - 29);
			start = d.toISOString().slice(0, 10);
			break;
		}
		case 'mtd': {
			const d = new Date(endDt);
			start = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
			break;
		}
		case 'ytd': {
			const d = new Date(endDt);
			start = `${d.getUTCFullYear()}-01-01`;
			break;
		}
	}

	return { start, end };
}
