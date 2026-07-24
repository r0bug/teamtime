/**
 * Payroll export: turn TeamTime's clock-of-record (time entries, break
 * allowance applied) into the per-employee, per-earning-type hours a payroll
 * clerk keys into NRS payroll checks.
 *
 * TeamTime is authoritative for WORKED time only. It splits worked hours into
 * Regular and Overtime (WA rule: > 40 hours per Sun–Sat workweek). Paid leave
 * (Holiday / PTO / Sick) is not modelled in TeamTime yet, so those NRS earning
 * lines are entered by hand — this export covers Regular + Overtime.
 */

import { and, eq, gte, lte } from 'drizzle-orm';
import { db, timeEntries, users } from '$lib/server/db';
import { paidHoursByEntry } from '$lib/server/utils/break-allowance';
import { getPacificDateParts } from '$lib/server/utils/timezone';

const OT_WEEKLY_THRESHOLD = 40;

// NRS earning-type ids (prEarningTableId), from the NRS payroll UI. Regular and
// Overtime are the ones TeamTime produces; the rest are here for the clerk's
// reference and the CSV legend.
export const NRS_EARNING_TYPES = {
	regular: { id: 199, code: 'R', label: 'Regular' },
	overtime: { id: 283, code: 'OT', label: 'Overtime' },
	holiday: { id: 201, code: 'H', label: 'Holiday' },
	pto: { id: 202, code: 'PTO', label: 'PTO' },
	sick: { id: 232, code: 'SIC', label: 'Sick' }
} as const;

export interface EmployeePayrollRow {
	userId: string;
	name: string;
	nrsEmployeeId: number | null;
	regularHours: number;
	overtimeHours: number;
	totalHours: number;
	/** Weeks (Sun-Sat) that ran past 40h — the clerk can sanity-check OT. */
	overtimeWeeks: number;
	/** True if a workweek is only partially inside this period (OT may need review). */
	hasSplitWeek: boolean;
}

/** Pacific Sun–Sat workweek key ("YYYY-Www"-ish) for a UTC instant. */
function workweekKey(instant: Date): string {
	const p = getPacificDateParts(instant);
	// Roll back to the Sunday of this Pacific week.
	const sunday = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday));
	return sunday.toISOString().slice(0, 10);
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * Compute Regular/Overtime hours per active staff member for a pay period.
 * `periodStart`/`periodEnd` are UTC instants (Pacific day bounds). Only staff
 * users are returned; the caller filters vendors upstream via the user query.
 */
export async function computePayrollForPeriod(
	periodStart: Date,
	periodEnd: Date
): Promise<EmployeePayrollRow[]> {
	const entries = await db
		.select({
			id: timeEntries.id,
			userId: timeEntries.userId,
			userName: users.name,
			nrsEmployeeId: users.nrsEmployeeId,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(and(gte(timeEntries.clockIn, periodStart), lte(timeEntries.clockIn, periodEnd)))
		.orderBy(timeEntries.clockIn);

	// Break-allowance-adjusted paid hours per entry (matches timesheet + export-hours).
	const paidByEntry = await paidHoursByEntry(entries);

	// Bucket paid hours by (user, workweek).
	type Agg = {
		userId: string;
		name: string;
		nrsEmployeeId: number | null;
		weekHours: Map<string, number>;
	};
	const byUser = new Map<string, Agg>();
	for (const e of entries) {
		const paid = paidByEntry.get(e.id);
		if (paid === undefined || paid <= 0) continue;
		let agg = byUser.get(e.userId);
		if (!agg) {
			agg = { userId: e.userId, name: e.userName, nrsEmployeeId: e.nrsEmployeeId, weekHours: new Map() };
			byUser.set(e.userId, agg);
		}
		const wk = workweekKey(e.clockIn);
		agg.weekHours.set(wk, (agg.weekHours.get(wk) ?? 0) + paid);
	}

	// A workweek is "split" if its Sunday falls before the period start — its
	// earlier days sit in the prior period, so its 40h line may straddle the
	// boundary and the clerk should confirm OT for that week.
	const periodStartMs = periodStart.getTime();

	const rows: EmployeePayrollRow[] = [];
	for (const agg of byUser.values()) {
		let regular = 0;
		let overtime = 0;
		let overtimeWeeks = 0;
		let hasSplitWeek = false;
		for (const [wk, hours] of agg.weekHours) {
			const ot = Math.max(0, hours - OT_WEEKLY_THRESHOLD);
			regular += hours - ot;
			overtime += ot;
			if (ot > 0) overtimeWeeks++;
			// Sunday of this week, as a Pacific-midnight UTC instant approximation.
			const sundayMs = new Date(wk + 'T00:00:00Z').getTime();
			if (sundayMs < periodStartMs - 12 * 3600 * 1000) hasSplitWeek = true;
		}
		rows.push({
			userId: agg.userId,
			name: agg.name,
			nrsEmployeeId: agg.nrsEmployeeId,
			regularHours: round2(regular),
			overtimeHours: round2(overtime),
			totalHours: round2(regular + overtime),
			overtimeWeeks,
			hasSplitWeek
		});
	}

	rows.sort((a, b) => a.name.localeCompare(b.name));
	return rows;
}
