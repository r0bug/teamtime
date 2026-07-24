import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB and the break-allowance helper; we're testing the OT/earning-type
// math in computePayrollForPeriod, not the queries.
const entryRows: {
	id: string;
	userId: string;
	userName: string;
	nrsEmployeeId: number | null;
	clockIn: Date;
	clockOut: Date;
}[] = [];

vi.mock('$lib/server/db', () => {
	const chain = {
		select: () => chain,
		from: () => chain,
		innerJoin: () => chain,
		where: () => chain,
		orderBy: () => Promise.resolve(entryRows)
	};
	return {
		db: chain,
		timeEntries: { id: 'id', userId: 'user_id', clockIn: 'clock_in', clockOut: 'clock_out' },
		users: { id: 'id', name: 'name', nrsEmployeeId: 'nrs_employee_id' }
	};
});

// paidHours = raw clock duration in hours (no break deduction) for these tests.
vi.mock('$lib/server/utils/break-allowance', () => ({
	paidHoursByEntry: async (entries: { id: string; clockIn: Date; clockOut: Date }[]) => {
		const m = new Map<string, number>();
		for (const e of entries) m.set(e.id, (e.clockOut.getTime() - e.clockIn.getTime()) / 3600000);
		return m;
	}
}));

import { computePayrollForPeriod } from '$lib/server/services/payroll-export-service';

// Build a clock entry of `hours` starting at Pacific `dateStr` 08:00.
let seq = 0;
function entry(userId: string, name: string, nrsId: number | null, dateStr: string, hours: number) {
	const clockIn = new Date(`${dateStr}T08:00:00-07:00`);
	const clockOut = new Date(clockIn.getTime() + hours * 3600000);
	entryRows.push({ id: `e${seq++}`, userId, userName: name, nrsEmployeeId: nrsId, clockIn, clockOut });
}

beforeEach(() => {
	entryRows.length = 0;
	seq = 0;
});

// Period: Jul 11–25 2026 (Pacific). Weeks: Jul 5–11, 12–18, 19–25.
const START = new Date('2026-07-11T07:00:00Z');
const END = new Date('2026-07-26T06:59:59.999Z');

describe('computePayrollForPeriod — overtime split', () => {
	it('under 40h in a week is all regular, no OT', async () => {
		// Mon Jul 13 + Wed Jul 15, 8h each = 16h in the Jul 12–18 week
		entry('u1', 'Amy Adams', 100, '2026-07-13', 8);
		entry('u1', 'Amy Adams', 100, '2026-07-15', 8);
		const [row] = await computePayrollForPeriod(START, END);
		expect(row.regularHours).toBe(16);
		expect(row.overtimeHours).toBe(0);
		expect(row.overtimeWeeks).toBe(0);
	});

	it('over 40h in one week splits the excess into OT', async () => {
		// Mon–Fri Jul 13–17, 9h each = 45h in one week → 40 reg + 5 OT
		for (const d of ['13', '14', '15', '16', '17']) entry('u1', 'Amy Adams', 100, `2026-07-${d}`, 9);
		const [row] = await computePayrollForPeriod(START, END);
		expect(row.regularHours).toBe(40);
		expect(row.overtimeHours).toBe(5);
		expect(row.overtimeWeeks).toBe(1);
		expect(row.totalHours).toBe(45);
	});

	it('computes OT per workweek, not across the whole period', async () => {
		// 30h in week Jul 12–18 and 30h in week Jul 19–25 = 60h total but NO OT
		entry('u1', 'Amy Adams', 100, '2026-07-13', 30 / 2);
		entry('u1', 'Amy Adams', 100, '2026-07-15', 30 / 2);
		entry('u1', 'Amy Adams', 100, '2026-07-20', 30 / 2);
		entry('u1', 'Amy Adams', 100, '2026-07-22', 30 / 2);
		const [row] = await computePayrollForPeriod(START, END);
		expect(row.regularHours).toBe(60);
		expect(row.overtimeHours).toBe(0);
	});

	it('separates employees and sorts by name', async () => {
		entry('u2', 'Zed Zephyr', 200, '2026-07-13', 8);
		entry('u1', 'Amy Adams', 100, '2026-07-13', 8);
		const rows = await computePayrollForPeriod(START, END);
		expect(rows.map((r) => r.name)).toEqual(['Amy Adams', 'Zed Zephyr']);
		expect(rows[0].nrsEmployeeId).toBe(100);
	});

	it('flags a workweek that straddles the period start', async () => {
		// Jul 11 is a Saturday — its week (Jul 5–11) starts before the period.
		entry('u1', 'Amy Adams', 100, '2026-07-11', 6);
		const [row] = await computePayrollForPeriod(START, END);
		expect(row.hasSplitWeek).toBe(true);
		expect(row.regularHours).toBe(6);
	});

	it('carries a null nrsEmployeeId through for unmapped staff', async () => {
		entry('u1', 'New Hire', null, '2026-07-13', 8);
		const [row] = await computePayrollForPeriod(START, END);
		expect(row.nrsEmployeeId).toBeNull();
	});
});
