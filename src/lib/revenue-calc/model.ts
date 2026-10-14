// Revenue calculator math. Pure and client-safe: no DB, no dates.
//
// The rent model is a straight line between two anchors: a vendor paying
// `rentLow` $/sq ft/month gives the store `commLow` % of gross sales; one
// paying `rentHigh` gives `commHigh` %. In between is linear. Rent per sq ft
// outside the anchors clamps to the nearest end.
//
//   store revenue (month) = rent + commission% × gross sales
//   per sq ft             = store revenue / sq ft

export interface RentScale {
	rentLow: number; // $/sq ft/month
	commLow: number; // % of gross (0-100)
	rentHigh: number;
	commHigh: number;
}

export const DEFAULT_SCALE: RentScale = { rentLow: 0, commLow: 40, rentHigh: 4, commHigh: 10 };

export function normalizeScale(raw: Partial<RentScale> | null | undefined): RentScale {
	const n = (v: unknown, d: number, lo: number, hi: number) => {
		const x = Number(v);
		return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
	};
	const s: RentScale = {
		rentLow: n(raw?.rentLow, DEFAULT_SCALE.rentLow, 0, 1000),
		commLow: n(raw?.commLow, DEFAULT_SCALE.commLow, 0, 100),
		rentHigh: n(raw?.rentHigh, DEFAULT_SCALE.rentHigh, 0, 1000),
		commHigh: n(raw?.commHigh, DEFAULT_SCALE.commHigh, 0, 100)
	};
	if (s.rentHigh < s.rentLow) [s.rentLow, s.rentHigh] = [s.rentHigh, s.rentLow];
	return s;
}

/** Commission % the scale assigns to a rent level. */
export function commissionAt(scale: RentScale, rentPerSqft: number): number {
	const { rentLow, commLow, rentHigh, commHigh } = scale;
	if (rentHigh === rentLow) return commLow;
	const t = Math.min(1, Math.max(0, (rentPerSqft - rentLow) / (rentHigh - rentLow)));
	return round2(commLow + (commHigh - commLow) * t);
}

/** Rent $/sq ft the scale assigns to a commission % (inverse of commissionAt). */
export function rentAt(scale: RentScale, commissionPct: number): number {
	const { rentLow, commLow, rentHigh, commHigh } = scale;
	if (commHigh === commLow) return rentLow;
	const t = Math.min(1, Math.max(0, (commissionPct - commLow) / (commHigh - commLow)));
	return round2(rentLow + (rentHigh - rentLow) * t);
}

/** Evenly spaced (rent, commission) points for previewing a scale. */
export function scaleSteps(scale: RentScale, steps = 8): { rentPerSqft: number; commissionPct: number }[] {
	const out: { rentPerSqft: number; commissionPct: number }[] = [];
	for (let i = 0; i <= steps; i++) {
		const r = scale.rentLow + ((scale.rentHigh - scale.rentLow) * i) / steps;
		out.push({ rentPerSqft: round2(r), commissionPct: commissionAt(scale, r) });
	}
	return out;
}

export interface BoothTerms {
	sqft: number;
	rentPerSqft: number;
	commissionPct: number;
	/** Gross monthly sales the booth is expected to ring. */
	monthlySales: number;
}

export interface BoothOutcome {
	rent: number;
	commission: number;
	storeRevenue: number;
	perSqft: number | null;
	vendorNet: number;
	/** Shortfall against the target, 0 when at/above it (null when no target). */
	gapToTarget: number | null;
}

export function evaluate(t: BoothTerms, targetPerSqft: number | null = null): BoothOutcome {
	const sqft = Math.max(0, t.sqft);
	const sales = Math.max(0, t.monthlySales);
	const rent = round2(sqft * Math.max(0, t.rentPerSqft));
	const commission = round2((sales * clampPct(t.commissionPct)) / 100);
	const storeRevenue = round2(rent + commission);
	const perSqft = sqft > 0 ? round2(storeRevenue / sqft) : null;
	const gapToTarget = targetPerSqft !== null && sqft > 0 ? round2(Math.max(0, targetPerSqft * sqft - storeRevenue)) : null;
	return { rent, commission, storeRevenue, perSqft, vendorNet: round2(sales - commission), gapToTarget };
}

/** Rent $/sq ft needed to reach the target per sq ft at the given sales and commission. */
export function rentPerSqftForTarget(sqft: number, targetPerSqft: number, monthlySales: number, commissionPct: number): number | null {
	if (sqft <= 0) return null;
	const needed = targetPerSqft * sqft - (monthlySales * clampPct(commissionPct)) / 100;
	return round2(Math.max(0, needed / sqft));
}

/** Gross sales at which the target per sq ft is met at the given rent and commission. */
export function salesForTarget(sqft: number, targetPerSqft: number, rentPerSqft: number, commissionPct: number): number | null {
	const pct = clampPct(commissionPct);
	if (sqft <= 0 || pct <= 0) return null;
	return round2(Math.max(0, ((targetPerSqft - rentPerSqft) * sqft * 100) / pct));
}

/**
 * Gross monthly sales at which two rent/commission options earn the store the
 * same amount. Below it the higher-rent option earns more; above it the
 * higher-commission option does. Null when the options don't cross.
 */
export function breakEvenSales(
	sqft: number,
	a: { rentPerSqft: number; commissionPct: number },
	b: { rentPerSqft: number; commissionPct: number }
): number | null {
	const dComm = clampPct(b.commissionPct) - clampPct(a.commissionPct);
	if (dComm === 0) return null;
	const sales = (sqft * (a.rentPerSqft - b.rentPerSqft) * 100) / dComm;
	return sales >= 0 ? round2(sales) : null;
}

export type BaselineMode = 'last' | 'avg3' | 'avg6' | 'avg12' | 'trend' | 'manual';

/**
 * Baseline monthly sales from a history (oldest first, null = no data that
 * month). 'trend' fits a line through the last 6 known months and projects
 * one month ahead (never below 0). Returns null when there is no usable data.
 */
export function baselineSales(history: (number | null)[], mode: BaselineMode): number | null {
	const known = history.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));
	if (known.length === 0 || mode === 'manual') return null;
	const lastN = (n: number) => known.slice(-n).map((p) => p.v);
	const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
	switch (mode) {
		case 'last':
			return round2(known[known.length - 1].v);
		case 'avg3':
			return avg(lastN(3));
		case 'avg6':
			return avg(lastN(6));
		case 'avg12':
			return avg(lastN(12));
		case 'trend': {
			const pts = known.slice(-6);
			if (pts.length < 2) return round2(pts[0].v);
			const n = pts.length;
			const mx = pts.reduce((a, p) => a + p.i, 0) / n;
			const my = pts.reduce((a, p) => a + p.v, 0) / n;
			const sxx = pts.reduce((a, p) => a + (p.i - mx) ** 2, 0);
			const slope = sxx === 0 ? 0 : pts.reduce((a, p) => a + (p.i - mx) * (p.v - my), 0) / sxx;
			const nextI = history.length; // one month past the end of the window
			return round2(Math.max(0, my + slope * (nextI - mx)));
		}
	}
}

export function applyGrowth(sales: number, growthPct: number): number {
	return round2(Math.max(0, sales * (1 + growthPct / 100)));
}

export interface Totals {
	sqft: number;
	sales: number;
	rent: number;
	commission: number;
	storeRevenue: number;
	perSqft: number | null;
}

export function totals(rows: { sqft: number; monthlySales: number; outcome: BoothOutcome }[]): Totals {
	const sqft = rows.reduce((a, r) => a + Math.max(0, r.sqft), 0);
	const sales = round2(rows.reduce((a, r) => a + Math.max(0, r.monthlySales), 0));
	const rent = round2(rows.reduce((a, r) => a + r.outcome.rent, 0));
	const commission = round2(rows.reduce((a, r) => a + r.outcome.commission, 0));
	const storeRevenue = round2(rent + commission);
	return { sqft, sales, rent, commission, storeRevenue, perSqft: sqft > 0 ? round2(storeRevenue / sqft) : null };
}

function clampPct(p: number): number {
	return Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0;
}

export function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
