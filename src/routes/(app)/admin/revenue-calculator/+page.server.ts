import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, appSettings } from '$lib/server/db';
import { isAdmin } from '$lib/server/auth/roles';
import { loadTargetPerSqft } from '$lib/server/floorplan/target';
import { recentMonths, salesByVendorByMonth } from '$lib/server/floorplan/revenue-trends';
import { liveBooths, loadBoothHistory, boothCommission, captureBoothHistory, currentMonth } from '$lib/server/floorplan/booth-history';
import { normalizeScale, normalizeCosts, type RentScale, type CostLine } from '$lib/revenue-calc/model';
import { audit } from '$lib/server/services/audit-service';
import { createLogger } from '$lib/server/logger';
import { laborByMonth } from '$lib/server/services/labor-cost';

const log = createLogger('admin:revenue-calculator');
const SCALE_KEY = 'revenue_calc_scale';
const COSTS_KEY = 'store_monthly_costs';
// Blended card-processing cost as % of pre-tax sales (Jul–Sep 2026 statements ÷ NRS sales = 1.66%).
const PROCESSING_KEY = 'payment_processing_pct';
const DEFAULT_PROCESSING_PCT = 1.66;
const HISTORY_MONTHS = 12;

export interface CalcVendor {
	key: string;
	label: string;
	names: string[];
	vendorIds: number[];
	shared: boolean;
	/** On the floorplan today? */
	current: boolean;
	/** Latest month with an archive row (null when never archived). */
	lastSeenMonth: string | null;
	sqft: number;
	rent: number;
	/** Store commission % on gross, from vendor payment % (null when unknown). */
	commissionPct: number | null;
	/** Oldest → newest, aligned with `months`. */
	sales: (number | null)[];
	retained: (number | null)[];
	sqftHistory: (number | null)[];
	rentHistory: (number | null)[];
}

async function loadScale(): Promise<RentScale> {
	const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SCALE_KEY)).limit(1);
	if (!row) return normalizeScale(null);
	try {
		return normalizeScale(JSON.parse(row.value));
	} catch {
		return normalizeScale(null);
	}
}

async function loadCosts(): Promise<CostLine[]> {
	const [row] = await db.select().from(appSettings).where(eq(appSettings.key, COSTS_KEY)).limit(1);
	if (!row) return [];
	try {
		return normalizeCosts(JSON.parse(row.value));
	} catch {
		return [];
	}
}

async function loadProcessingPct(): Promise<number> {
	const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PROCESSING_KEY)).limit(1);
	const n = Number(row?.value);
	return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_PROCESSING_PCT;
}

async function upsertSetting(key: string, value: string): Promise<void> {
	const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
	if (existing) await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key));
	else await db.insert(appSettings).values({ key, value });
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) throw redirect(302, '/admin');

	const months = recentMonths(HISTORY_MONTHS);
	const thisMonth = currentMonth();
	const [scale, costs, processingPct, target, live, history, sales, labor] = await Promise.all([
		loadScale(),
		loadCosts(),
		loadProcessingPct(),
		loadTargetPerSqft(),
		liveBooths(),
		loadBoothHistory(),
		salesByVendorByMonth([...months, thisMonth]),
		// Same calculation as the Sales page's "Total Labor": hours × hourly rate
		// for users flagged includeInLaborCost, per complete calendar month.
		laborByMonth(months)
	]);

	const liveByKey = new Map(live.booths.map((b) => [b.key, b]));
	const keys = new Set<string>([...liveByKey.keys(), ...history.keys()]);

	const vendorsOut: CalcVendor[] = [];
	for (const key of keys) {
		const booth = liveByKey.get(key);
		const hist = history.get(key);
		const latest = hist?.latest;
		const vendorIds = booth?.vendorIds ?? latest?.vendorIds ?? [];
		const monthSales = (m: string, field: 'gross' | 'retained') => {
			let any = false;
			let sum = 0;
			for (const id of vendorIds) {
				const v = sales.get(id)?.get(m);
				if (v) {
					any = true;
					sum += v[field];
				}
			}
			return any ? Math.round(sum * 100) / 100 : null;
		};
		const histByMonth = new Map(hist?.months.map((h) => [h.month, h]) ?? []);
		const commission = booth
			? boothCommission(booth, live.byId)
			: latest?.commissionPercent !== null && latest?.commissionPercent !== undefined
				? Number(latest.commissionPercent)
				: null;
		vendorsOut.push({
			key,
			label: booth?.label ?? latest?.label ?? key,
			names: booth?.names ?? latest?.names ?? [],
			vendorIds,
			shared: booth?.shared ?? latest?.shared ?? false,
			current: !!booth,
			lastSeenMonth: latest?.month ?? null,
			sqft: booth?.sqft ?? latest?.sqft ?? 0,
			rent: booth?.rent ?? (latest ? latest.rentCents / 100 : 0),
			commissionPct: commission,
			sales: months.map((m) => monthSales(m, 'gross')),
			retained: months.map((m) => monthSales(m, 'retained')),
			sqftHistory: months.map((m) => histByMonth.get(m)?.sqft ?? null),
			rentHistory: months.map((m) => histByMonth.get(m)?.rent ?? null)
		});
	}
	vendorsOut.sort((a, b) => Number(b.current) - Number(a.current) || a.label.localeCompare(b.label));

	// Month-to-date sales for the current month (shown as context, not in the baseline window).
	const archivedMonths = [...new Set([...history.values()].flatMap((h) => h.months.map((m) => m.month)))].sort();

	return {
		scale,
		costs,
		processingPct,
		target,
		/** Labor $ per month, aligned with `months` (oldest → newest). */
		labor: months.map((m) => labor.get(m) ?? 0),
		months,
		thisMonth,
		vendors: vendorsOut,
		archive: {
			months: archivedMonths,
			lastCapturedAt: [...history.values()].reduce<Date | null>((acc, h) => {
				const t = h.latest.capturedAt;
				return !acc || t > acc ? t : acc;
			}, null)?.toISOString() ?? null
		}
	};
};

export const actions: Actions = {
	saveScale: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { error: 'Not authorized' });
		const form = await request.formData();
		const scale = normalizeScale({
			mode: form.get('mode') === 'linear' ? 'linear' : 'step',
			rentLow: Number(form.get('rentLow')),
			commLow: Number(form.get('commLow')),
			rentHigh: Number(form.get('rentHigh')),
			commHigh: Number(form.get('commHigh')),
			minComm: Number(form.get('minComm'))
		});
		const value = JSON.stringify(scale);
		try {
			const before = await loadScale();
			await upsertSetting(SCALE_KEY, value);
			await audit({
				userId: locals.user!.id,
				action: 'setting_changed',
				entityType: 'setting',
				entityId: SCALE_KEY,
				beforeData: before as unknown as Record<string, unknown>,
				afterData: scale as unknown as Record<string, unknown>
			});
			return { success: true, message: 'Rent scale saved', scale };
		} catch (error) {
			log.error({ error }, 'Failed to save rent scale');
			return fail(500, { error: 'Failed to save rent scale' });
		}
	},

	saveCosts: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { error: 'Not authorized' });
		const form = await request.formData();
		let parsed: unknown;
		try {
			parsed = JSON.parse(form.get('costs')?.toString() ?? '[]');
		} catch {
			return fail(400, { error: 'Costs could not be read' });
		}
		const costs = normalizeCosts(parsed);
		const pctRaw = Number(form.get('processingPct'));
		const processingPct = Number.isFinite(pctRaw) && pctRaw >= 0 && pctRaw <= 100 ? Math.round(pctRaw * 100) / 100 : DEFAULT_PROCESSING_PCT;
		try {
			const before = { costs: await loadCosts(), processingPct: await loadProcessingPct() };
			await upsertSetting(COSTS_KEY, JSON.stringify(costs));
			await upsertSetting(PROCESSING_KEY, String(processingPct));
			await audit({
				userId: locals.user!.id,
				action: 'setting_changed',
				entityType: 'setting',
				entityId: COSTS_KEY,
				beforeData: before,
				afterData: { costs, processingPct }
			});
			return { success: true, message: `Saved ${costs.length} cost line(s)` };
		} catch (error) {
			log.error({ error }, 'Failed to save monthly costs');
			return fail(500, { error: 'Failed to save costs' });
		}
	},

	capture: async ({ locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { error: 'Not authorized' });
		try {
			const r = await captureBoothHistory('manual');
			const extra = r.backfilled.length ? `, backfilled ${r.backfilled.length} earlier month(s) from floorplan snapshots` : '';
			return { success: true, message: `Archived ${r.booths} booth(s) for ${r.month}${extra}` };
		} catch (error) {
			log.error({ error }, 'Manual booth history capture failed');
			return fail(500, { error: 'Capture failed' });
		}
	}
};
