// Labor cost = clocked hours × the user's hourly rate, for users flagged
// includeInLaborCost. Entries are bucketed by overlap with the window, so a
// shift crossing midnight or a month boundary is split correctly. This is the
// one calculation behind the Sales page's "Total Labor" and the revenue
// calculator's average monthly labor line.

import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db, timeEntries, users } from '$lib/server/db';
import { createPacificDateTime } from '$lib/server/utils/timezone';

export interface LaborEntry {
	startMs: number;
	endMs: number;
	rate: number;
}

/** Every paid, rate-bearing time entry overlapping [windowStart, windowEnd), clipped to now. */
export async function loadLaborEntries(windowStart: Date, windowEnd: Date = new Date()): Promise<LaborEntry[]> {
	const rows = await db
		.select({ clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut, hourlyRate: users.hourlyRate })
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(and(lt(timeEntries.clockIn, windowEnd), or(isNull(timeEntries.clockOut), gt(timeEntries.clockOut, windowStart)), eq(users.includeInLaborCost, true)));

	const nowMs = Date.now();
	const out: LaborEntry[] = [];
	for (const e of rows) {
		const rate = e.hourlyRate ? parseFloat(e.hourlyRate) : NaN;
		if (!Number.isFinite(rate) || rate <= 0) continue;
		const startMs = e.clockIn.getTime();
		const endMs = Math.min(e.clockOut ? e.clockOut.getTime() : nowMs, nowMs);
		if (endMs <= startMs) continue;
		out.push({ startMs, endMs, rate });
	}
	return out;
}

/** Labor $ inside [startMs, endMs) from pre-loaded entries. */
export function laborBetween(entries: LaborEntry[], startMs: number, endMs: number): number {
	let total = 0;
	for (const e of entries) {
		const overlap = Math.min(e.endMs, endMs) - Math.max(e.startMs, startMs);
		if (overlap > 0) total += (overlap / 3_600_000) * e.rate;
	}
	return total;
}

/** Labor $ for one Pacific calendar day (YYYY-MM-DD). */
export function laborForPacificDay(entries: LaborEntry[], dateKey: string): number {
	return laborBetween(entries, createPacificDateTime(dateKey, 0, 0).getTime(), createPacificDateTime(dateKey, 24, 0).getTime());
}

/** Labor $ per calendar month ('YYYY-MM', Pacific) for the given months. */
export async function laborByMonth(months: string[]): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	if (months.length === 0) return out;
	const sorted = [...months].sort();
	const bounds = (m: string) => {
		const [y, mo] = m.split('-').map(Number);
		const start = createPacificDateTime(`${m}-01`, 0, 0);
		const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
		return { start, end: createPacificDateTime(`${next}-01`, 0, 0) };
	};
	const entries = await loadLaborEntries(bounds(sorted[0]).start, bounds(sorted[sorted.length - 1]).end);
	for (const m of months) {
		const b = bounds(m);
		out.set(m, Math.round(laborBetween(entries, b.start.getTime(), b.end.getTime()) * 100) / 100);
	}
	return out;
}
