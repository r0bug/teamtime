/**
 * Vendor gamification stats.
 *
 * Reads from `salesSnapshots` for fast daily-aggregate queries (one row per
 * sale-date, vendor breakdown lives in jsonb) and `salesTransactions` for
 * item-level metrics + streaks (one row per POS line item).
 *
 * Design notes:
 *  - Pacific time everywhere, matching `vendor-leaderboard-service.ts:resolvePeriod`.
 *  - `salesTransactions.price` is `numeric(12,2)` — drizzle returns it as string;
 *    we coerce with `Number(...)` once at the boundary.
 *  - `salesSnapshots.vendors[].vendor_amount` and friends come back as numbers
 *    (jsonb), already in dollars (the existing leaderboard service applies
 *    `round2` to them, confirming dollar units).
 *  - Read-only. No inserts/updates.
 */
import { and, gte, inArray, lte, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { salesSnapshots, salesTransactions, vendors } from '$lib/server/db/schema';

interface SnapshotVendor {
	vendor_id: string;
	vendor_name: string;
	total_sales: number;
	vendor_amount: number;
	retained_amount: number;
}

export interface DailySellerWinner {
	nrsVendorId: number;
	displayName: string;
	vendorPortion: number;
	gross: number;
}

export interface DailyWinnerEntry {
	date: string;
	vendor: DailySellerWinner;
}

export interface BestSellingItem {
	partNumber: string;
	partName: string | null;
	vendorDisplayName: string;
	totalUnits: number;
	totalGross: number;
}

export interface MostItemsResult {
	nrsVendorId: number;
	displayName: string;
	date: string;
	itemCount: number;
	transactionCount: number;
}

export interface StreakRow {
	nrsVendorId: number;
	displayName: string;
	streakDays: number;
	streakStart: string;
	streakEnd: string;
}

export interface HotBoothRow {
	nrsVendorId: number;
	displayName: string;
	currentTotal: number;
	priorTotal: number;
	deltaPercent: number;
}

export interface VendorPersonalStats {
	allTimeGross: number;
	allTimeVendorPortion: number;
	bestDayEver: { date: string; gross: number; vendorPortion: number } | null;
	bestWeekEver: { startDate: string; endDate: string; gross: number; vendorPortion: number } | null;
	last30DaysGross: number;
	last30DaysVendorPortion: number;
	mtdGross: number;
	mtdVendorPortion: number;
	mtdRank: number | null;
	totalVendorCount: number;
	currentStreak: number;
	longestStreak: number;
}

// ---------- helpers --------------------------------------------------------

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Today in Pacific time as YYYY-MM-DD. */
function todayPacific(): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
}

// postgres-js returns `date` columns as JS Date objects, not 'YYYY-MM-DD' strings.
// Coerce both forms here so callers can pass either.
function toYmd(input: string | Date): string {
	if (input instanceof Date) return input.toISOString().slice(0, 10);
	return input;
}

function addDays(input: string | Date, days: number): string {
	const d = new Date(toYmd(input) + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function diffDaysInclusive(start: string | Date, end: string | Date): number {
	const a = new Date(toYmd(start) + 'T00:00:00Z').getTime();
	const b = new Date(toYmd(end) + 'T00:00:00Z').getTime();
	return Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

/** Date range covering the same number of days, immediately preceding [start, end]. */
function priorRange(startDate: string, endDate: string): { start: string; end: string } {
	const len = diffDaysInclusive(startDate, endDate);
	const priorEnd = addDays(startDate, -1);
	const priorStart = addDays(priorEnd, -(len - 1));
	return { start: priorStart, end: priorEnd };
}

function defaultRange(): { start: string; end: string } {
	const end = todayPacific();
	const start = addDays(end, -29);
	return { start, end };
}

/** Pull the latest snapshot per saleDate within a window. */
async function loadSnapshotsByDate(start: string, end: string): Promise<Map<string, SnapshotVendor[]>> {
	const rows = await db
		.select({
			// Cast to text — postgres-js returns `date` as JS Date, but every consumer
			// downstream uses this as a YYYY-MM-DD string Map key.
			saleDate: sql<string>`TO_CHAR(${salesSnapshots.saleDate}, 'YYYY-MM-DD')`,
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots)
		.where(and(gte(salesSnapshots.saleDate, start), lte(salesSnapshots.saleDate, end)));

	const byDate = new Map<string, SnapshotVendor[]>();
	for (const r of rows) {
		// Last write wins — re-imports overwrite earlier captures of the same day.
		byDate.set(r.saleDate, r.vendors as SnapshotVendor[]);
	}
	return byDate;
}

/** Resolve TT vendor records keyed by NRS vendor id. */
async function resolveTtVendors(nrsIds: number[]): Promise<Map<number, { displayName: string; boothNumber: string | null }>> {
	if (nrsIds.length === 0) return new Map();
	const rows = await db
		.select({
			nrsVendorId: vendors.nrsVendorId,
			displayName: vendors.displayName,
			boothNumber: vendors.boothNumber
		})
		.from(vendors)
		.where(inArray(vendors.nrsVendorId, nrsIds));

	const out = new Map<number, { displayName: string; boothNumber: string | null }>();
	for (const r of rows) {
		if (r.nrsVendorId !== null) {
			out.set(r.nrsVendorId, { displayName: r.displayName, boothNumber: r.boothNumber });
		}
	}
	return out;
}

function pickName(nrsId: number, fallback: string, tt: Map<number, { displayName: string; boothNumber: string | null }>): string {
	return tt.get(nrsId)?.displayName ?? fallback ?? `NRS #${nrsId}`;
}

// ---------- exported functions ---------------------------------------------

/** Winners for the last N days. Days with no sales data are simply omitted. */
export async function getDailyWinners(daysBack = 7): Promise<DailyWinnerEntry[]> {
	const end = todayPacific();
	const start = addDays(end, -(daysBack - 1));
	const byDate = await loadSnapshotsByDate(start, end);

	type Pick = { date: string; nrsVendorId: number; nrsVendorName: string; vendorAmount: number; gross: number };
	const picks: Pick[] = [];
	for (const [date, dayVendors] of byDate.entries()) {
		let top: SnapshotVendor | null = null;
		for (const v of dayVendors) {
			const id = parseInt(v.vendor_id, 10);
			if (!Number.isFinite(id) || id === 0) continue;
			if (top === null || (v.vendor_amount ?? 0) > (top.vendor_amount ?? 0)) top = v;
		}
		if (!top) continue;
		picks.push({
			date,
			nrsVendorId: parseInt(top.vendor_id, 10),
			nrsVendorName: top.vendor_name,
			vendorAmount: top.vendor_amount ?? 0,
			gross: top.total_sales ?? 0
		});
	}

	const tt = await resolveTtVendors(Array.from(new Set(picks.map((p) => p.nrsVendorId))));

	picks.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	return picks.map((p) => ({
		date: p.date,
		vendor: {
			nrsVendorId: p.nrsVendorId,
			displayName: pickName(p.nrsVendorId, p.nrsVendorName, tt),
			vendorPortion: round2(p.vendorAmount),
			gross: round2(p.gross)
		}
	}));
}

/** Top items by total units sold within the window. */
export async function getBestSellingItems(opts: {
	startDate?: string;
	endDate?: string;
	limit?: number;
}): Promise<BestSellingItem[]> {
	const { start, end } = opts.startDate && opts.endDate
		? { start: opts.startDate, end: opts.endDate }
		: defaultRange();
	const limit = opts.limit ?? 10;

	const rows = await db
		.select({
			partId: salesTransactions.partId,
			partNumber: salesTransactions.partNumber,
			vendorId: salesTransactions.vendorId,
			totalUnits: sql<number>`COALESCE(SUM(${salesTransactions.quantity}), 0)::int`,
			totalGross: sql<string>`COALESCE(SUM(${salesTransactions.totalPrice}), 0)`,
			// last-seen part name within the window
			lastPartName: sql<string | null>`(ARRAY_AGG(${salesTransactions.partName} ORDER BY ${salesTransactions.invoiceDate} DESC) FILTER (WHERE ${salesTransactions.partName} IS NOT NULL))[1]`
		})
		.from(salesTransactions)
		.where(and(
			gte(salesTransactions.invoiceDate, start),
			lte(salesTransactions.invoiceDate, end),
			sql`${salesTransactions.partNumber} IS NOT NULL`,
			sql`${salesTransactions.partId} IS NOT NULL`
		))
		.groupBy(salesTransactions.partId, salesTransactions.partNumber, salesTransactions.vendorId)
		.orderBy(sql`SUM(${salesTransactions.quantity}) DESC NULLS LAST`)
		.limit(limit);

	const ttIds = Array.from(new Set(rows.map((r) => r.vendorId).filter((v): v is number => v !== null && v > 0)));
	const tt = await resolveTtVendors(ttIds);

	// Also need a fallback name from the transaction itself when TT row is missing.
	// We didn't pull vendor_name from the aggregate — fetch it once for unmapped ids.
	const unmapped = ttIds.filter((id) => !tt.has(id));
	const unmappedNames = new Map<number, string>();
	if (unmapped.length > 0) {
		const nameRows = await db
			.select({
				vendorId: salesTransactions.vendorId,
				vendorName: sql<string | null>`MAX(${salesTransactions.vendorName})`
			})
			.from(salesTransactions)
			.where(inArray(salesTransactions.vendorId, unmapped))
			.groupBy(salesTransactions.vendorId);
		for (const n of nameRows) {
			if (n.vendorName) unmappedNames.set(n.vendorId, n.vendorName);
		}
	}

	return rows.map((r) => ({
		partNumber: r.partNumber as string,
		partName: r.lastPartName,
		vendorDisplayName: tt.get(r.vendorId)?.displayName ?? unmappedNames.get(r.vendorId) ?? `NRS #${r.vendorId}`,
		totalUnits: Number(r.totalUnits ?? 0),
		totalGross: round2(Number(r.totalGross ?? 0))
	}));
}

/** Vendor with the highest single-day SUM(quantity) within the window. */
export async function getMostItemsInOneDay(opts: {
	startDate?: string;
	endDate?: string;
}): Promise<MostItemsResult | null> {
	const { start, end } = opts.startDate && opts.endDate
		? { start: opts.startDate, end: opts.endDate }
		: defaultRange();

	const rows = await db
		.select({
			vendorId: salesTransactions.vendorId,
			// Cast to text — see comment in getLongestStreak.
			invoiceDate: sql<string>`TO_CHAR(${salesTransactions.invoiceDate}, 'YYYY-MM-DD')`,
			itemCount: sql<number>`COALESCE(SUM(${salesTransactions.quantity}), 0)::int`,
			// arCashRegId is the cash-register transaction id — one per "receipt".
			// Schema has no `invoiceNumber` column; this is the equivalent grouping key.
			transactionCount: sql<number>`COUNT(DISTINCT ${salesTransactions.arCashRegId})::int`
		})
		.from(salesTransactions)
		.where(and(
			gte(salesTransactions.invoiceDate, start),
			lte(salesTransactions.invoiceDate, end),
			sql`${salesTransactions.vendorId} IS NOT NULL AND ${salesTransactions.vendorId} > 0`
		))
		.groupBy(salesTransactions.vendorId, salesTransactions.invoiceDate)
		.orderBy(sql`SUM(${salesTransactions.quantity}) DESC NULLS LAST`)
		.limit(1);

	if (rows.length === 0) return null;
	const top = rows[0];
	const tt = await resolveTtVendors([top.vendorId]);

	let displayName = tt.get(top.vendorId)?.displayName ?? null;
	if (!displayName) {
		const [name] = await db
			.select({ vendorName: sql<string | null>`MAX(${salesTransactions.vendorName})` })
			.from(salesTransactions)
			.where(eq(salesTransactions.vendorId, top.vendorId));
		displayName = name?.vendorName ?? `NRS #${top.vendorId}`;
	}

	return {
		nrsVendorId: top.vendorId,
		displayName,
		date: top.invoiceDate,
		itemCount: Number(top.itemCount ?? 0),
		transactionCount: Number(top.transactionCount ?? 0)
	};
}

/**
 * For each vendor in the window, compute the longest run of consecutive
 * dates (calendar days) that include at least one transaction. Returns the
 * top 5 by streak length (ties broken by recency of streakEnd).
 */
export async function getLongestStreak(opts: {
	startDate?: string;
	endDate?: string;
}): Promise<StreakRow[]> {
	const { start, end } = opts.startDate && opts.endDate
		? { start: opts.startDate, end: opts.endDate }
		: defaultRange();

	const pairs = await db
		.selectDistinct({
			vendorId: salesTransactions.vendorId,
			// Cast to text in SQL — postgres-js returns `date` as JS Date otherwise,
			// which breaks the YYYY-MM-DD string comparisons below.
			invoiceDate: sql<string>`TO_CHAR(${salesTransactions.invoiceDate}, 'YYYY-MM-DD')`
		})
		.from(salesTransactions)
		.where(and(
			gte(salesTransactions.invoiceDate, start),
			lte(salesTransactions.invoiceDate, end),
			sql`${salesTransactions.vendorId} IS NOT NULL AND ${salesTransactions.vendorId} > 0`
		));

	// Group dates by vendor.
	const byVendor = new Map<number, string[]>();
	for (const p of pairs) {
		const arr = byVendor.get(p.vendorId) ?? [];
		arr.push(p.invoiceDate);
		byVendor.set(p.vendorId, arr);
	}

	const results: StreakRow[] = [];
	for (const [vendorId, dates] of byVendor.entries()) {
		dates.sort();
		let bestLen = 1;
		let bestStart = dates[0];
		let bestEnd = dates[0];
		let curLen = 1;
		let curStart = dates[0];
		for (let i = 1; i < dates.length; i++) {
			const prev = dates[i - 1];
			const cur = dates[i];
			if (addDays(prev, 1) === cur) {
				curLen += 1;
			} else {
				curLen = 1;
				curStart = cur;
			}
			if (curLen > bestLen || (curLen === bestLen && cur > bestEnd)) {
				bestLen = curLen;
				bestStart = curStart;
				bestEnd = cur;
			}
		}
		results.push({
			nrsVendorId: vendorId,
			displayName: '', // filled below
			streakDays: bestLen,
			streakStart: bestStart,
			streakEnd: bestEnd
		});
	}

	// Sort + take top 5.
	results.sort((a, b) => (b.streakDays - a.streakDays) || (b.streakEnd < a.streakEnd ? -1 : b.streakEnd > a.streakEnd ? 1 : 0));
	const top = results.slice(0, 5);

	const tt = await resolveTtVendors(top.map((r) => r.nrsVendorId));
	const unmapped = top.filter((r) => !tt.has(r.nrsVendorId)).map((r) => r.nrsVendorId);
	const fallback = new Map<number, string>();
	if (unmapped.length > 0) {
		const nameRows = await db
			.select({
				vendorId: salesTransactions.vendorId,
				vendorName: sql<string | null>`MAX(${salesTransactions.vendorName})`
			})
			.from(salesTransactions)
			.where(inArray(salesTransactions.vendorId, unmapped))
			.groupBy(salesTransactions.vendorId);
		for (const n of nameRows) if (n.vendorName) fallback.set(n.vendorId, n.vendorName);
	}

	for (const r of top) {
		r.displayName = tt.get(r.nrsVendorId)?.displayName ?? fallback.get(r.nrsVendorId) ?? `NRS #${r.nrsVendorId}`;
	}
	return top;
}

/**
 * Top 3 vendors by week-over-week (or matched-period) percent jump in vendor
 * portion. Skips vendors whose prior total is < $10 to suppress noise from
 * 0-dollar baselines.
 */
export async function getHotBooth(opts: {
	startDate?: string;
	endDate?: string;
}): Promise<HotBoothRow[]> {
	const { start, end } = opts.startDate && opts.endDate
		? { start: opts.startDate, end: opts.endDate }
		: defaultRange();
	const prior = priorRange(start, end);

	const [curBy, priorBy] = await Promise.all([
		loadSnapshotsByDate(start, end),
		loadSnapshotsByDate(prior.start, prior.end)
	]);

	const sumByVendor = (byDate: Map<string, SnapshotVendor[]>): Map<number, { amt: number; name: string }> => {
		const m = new Map<number, { amt: number; name: string }>();
		for (const dayVendors of byDate.values()) {
			for (const v of dayVendors) {
				const id = parseInt(v.vendor_id, 10);
				if (!Number.isFinite(id) || id === 0) continue;
				const cur = m.get(id) ?? { amt: 0, name: v.vendor_name };
				cur.amt += v.vendor_amount ?? 0;
				if (!cur.name && v.vendor_name) cur.name = v.vendor_name;
				m.set(id, cur);
			}
		}
		return m;
	};

	const cur = sumByVendor(curBy);
	const pri = sumByVendor(priorBy);

	type Cand = { nrsVendorId: number; current: number; prior: number; deltaPercent: number; name: string };
	const cands: Cand[] = [];
	for (const [id, c] of cur.entries()) {
		const p = pri.get(id);
		if (!p) continue;
		if (p.amt < 10) continue;
		const delta = ((c.amt - p.amt) / p.amt) * 100;
		cands.push({ nrsVendorId: id, current: c.amt, prior: p.amt, deltaPercent: delta, name: c.name });
	}
	cands.sort((a, b) => b.deltaPercent - a.deltaPercent);
	const top = cands.slice(0, 3);

	const tt = await resolveTtVendors(top.map((c) => c.nrsVendorId));
	return top.map((c) => ({
		nrsVendorId: c.nrsVendorId,
		displayName: pickName(c.nrsVendorId, c.name, tt),
		currentTotal: round2(c.current),
		priorTotal: round2(c.prior),
		deltaPercent: Math.round(c.deltaPercent * 10) / 10
	}));
}

/**
 * Personal stats card for one vendor. Uses snapshot data for daily/weekly
 * extremes, transactions for streaks.
 */
export async function getVendorPersonalStats(nrsVendorId: number): Promise<VendorPersonalStats> {
	// Pull all snapshot daily aggregates for this vendor (small — ~one row per day).
	const snapshotRows = await db
		.select({
			// Cast to text — see loadSnapshotsByDate comment.
			saleDate: sql<string>`TO_CHAR(${salesSnapshots.saleDate}, 'YYYY-MM-DD')`,
			vendors: salesSnapshots.vendors
		})
		.from(salesSnapshots);

	// daily map for this vendor: date -> { gross, vendorPortion }
	const myDays = new Map<string, { gross: number; vendorPortion: number }>();
	// also keep per-day MTD-period totals so we can rank within MTD
	const allByDay = new Map<string, SnapshotVendor[]>();
	for (const r of snapshotRows) {
		// last write wins
		allByDay.set(r.saleDate, r.vendors as SnapshotVendor[]);
	}

	for (const [date, dayVendors] of allByDay.entries()) {
		for (const v of dayVendors) {
			const id = parseInt(v.vendor_id, 10);
			if (id !== nrsVendorId) continue;
			myDays.set(date, {
				gross: v.total_sales ?? 0,
				vendorPortion: v.vendor_amount ?? 0
			});
		}
	}

	let allTimeGross = 0;
	let allTimeVendorPortion = 0;
	let bestDayEver: VendorPersonalStats['bestDayEver'] = null;
	const sortedDates = Array.from(myDays.keys()).sort();
	for (const d of sortedDates) {
		const v = myDays.get(d)!;
		allTimeGross += v.gross;
		allTimeVendorPortion += v.vendorPortion;
		if (!bestDayEver || v.vendorPortion > bestDayEver.vendorPortion) {
			bestDayEver = { date: d, gross: round2(v.gross), vendorPortion: round2(v.vendorPortion) };
		}
	}

	// Best 7-day sliding window. Ranked by vendorPortion when the vendor earns
	// commission; for pass-through vendors (vendorPortion always 0) we fall
	// back to ranking by gross so the card still surfaces a meaningful window.
	let bestWeekEver: VendorPersonalStats['bestWeekEver'] = null;
	if (sortedDates.length > 0) {
		const first = sortedDates[0];
		const last = sortedDates[sortedDates.length - 1];
		const totalDays = diffDaysInclusive(first, last);
		for (let i = 0; i < totalDays; i++) {
			const winStart = addDays(first, i);
			const winEnd = addDays(winStart, 6);
			let grossSum = 0;
			let portionSum = 0;
			for (let j = 0; j < 7; j++) {
				const d = addDays(winStart, j);
				const v = myDays.get(d);
				if (v) {
					grossSum += v.gross;
					portionSum += v.vendorPortion;
				}
			}
			const rank = portionSum > 0 ? portionSum : grossSum;
			const bestRank = bestWeekEver
				? (bestWeekEver.vendorPortion > 0 ? bestWeekEver.vendorPortion : bestWeekEver.gross)
				: -Infinity;
			if (rank > bestRank) {
				bestWeekEver = {
					startDate: winStart,
					endDate: winEnd,
					gross: round2(grossSum),
					vendorPortion: round2(portionSum)
				};
			}
		}
		if (bestWeekEver && bestWeekEver.gross <= 0 && bestWeekEver.vendorPortion <= 0) {
			bestWeekEver = null;
		}
	}

	// Last 30 days — track gross + vendor portion side by side.
	const today = todayPacific();
	const last30Start = addDays(today, -29);
	let last30Gross = 0;
	let last30Portion = 0;
	for (const [d, v] of myDays.entries()) {
		if (d >= last30Start && d <= today) {
			last30Gross += v.gross;
			last30Portion += v.vendorPortion;
		}
	}

	// MTD totals — both gross and vendor portion. Rank uses vendor portion when
	// any vendor in the period earned commission, otherwise ranks by gross so
	// pass-through-only periods still produce a meaningful ranking.
	const mtdStart = `${today.slice(0, 7)}-01`;
	const mtdGrossTotals = new Map<number, number>();
	const mtdPortionTotals = new Map<number, number>();
	for (const [d, dayVendors] of allByDay.entries()) {
		if (d < mtdStart || d > today) continue;
		for (const v of dayVendors) {
			const id = parseInt(v.vendor_id, 10);
			if (!Number.isFinite(id) || id === 0) continue;
			mtdGrossTotals.set(id, (mtdGrossTotals.get(id) ?? 0) + (v.total_sales ?? 0));
			mtdPortionTotals.set(id, (mtdPortionTotals.get(id) ?? 0) + (v.vendor_amount ?? 0));
		}
	}
	const myMtdGross = mtdGrossTotals.get(nrsVendorId) ?? 0;
	const myMtdPortion = mtdPortionTotals.get(nrsVendorId) ?? 0;
	const anyPortionEarned = Array.from(mtdPortionTotals.values()).some((n) => n > 0);
	const rankSource = anyPortionEarned ? mtdPortionTotals : mtdGrossTotals;
	const sortedMtd = Array.from(rankSource.entries()).sort((a, b) => b[1] - a[1]);
	const mtdRankIdx = sortedMtd.findIndex(([id]) => id === nrsVendorId);
	const mtdRank = mtdRankIdx === -1 ? null : mtdRankIdx + 1;

	// Total vendor count across all time (anyone who ever sold something).
	const totalVendorCount = (() => {
		const ids = new Set<number>();
		for (const dayVendors of allByDay.values()) {
			for (const v of dayVendors) {
				const id = parseInt(v.vendor_id, 10);
				if (Number.isFinite(id) && id !== 0) ids.add(id);
			}
		}
		return ids.size;
	})();

	// Streaks — distinct sale dates from transactions for this vendor.
	const txDates = await db
		.selectDistinct({
			invoiceDate: sql<string>`TO_CHAR(${salesTransactions.invoiceDate}, 'YYYY-MM-DD')`
		})
		.from(salesTransactions)
		.where(eq(salesTransactions.vendorId, nrsVendorId));

	const dateList = txDates.map((r) => r.invoiceDate).sort();
	let longestStreak = 0;
	let currentStreak = 0;
	if (dateList.length > 0) {
		let curLen = 1;
		let bestLen = 1;
		for (let i = 1; i < dateList.length; i++) {
			if (addDays(dateList[i - 1], 1) === dateList[i]) curLen += 1;
			else curLen = 1;
			if (curLen > bestLen) bestLen = curLen;
		}
		longestStreak = bestLen;

		// Current streak: walk backwards from latest sale date. If the latest is
		// today or yesterday, we count it as active; otherwise the streak is 0.
		const latest = dateList[dateList.length - 1];
		const yesterday = addDays(today, -1);
		if (latest === today || latest === yesterday) {
			let len = 1;
			for (let i = dateList.length - 2; i >= 0; i--) {
				if (addDays(dateList[i], 1) === dateList[i + 1]) len += 1;
				else break;
			}
			currentStreak = len;
		} else {
			currentStreak = 0;
		}
	}

	return {
		allTimeGross: round2(allTimeGross),
		allTimeVendorPortion: round2(allTimeVendorPortion),
		bestDayEver,
		bestWeekEver,
		last30DaysGross: round2(last30Gross),
		last30DaysVendorPortion: round2(last30Portion),
		mtdGross: round2(myMtdGross),
		mtdVendorPortion: round2(myMtdPortion),
		mtdRank,
		totalVendorCount,
		currentStreak,
		longestStreak
	};
}
