import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';
import { toPacificDateString } from '$lib/server/utils/timezone';
import {
	getPayPeriodConfig,
	getCurrentPayPeriod,
	listRecentPayPeriods
} from '$lib/server/services/pay-period-service';
import { computePayrollForPeriod, NRS_EARNING_TYPES } from '$lib/server/services/payroll-export-service';
import { getEmployees, type NrsEmployee } from '$lib/server/services/nrs-api-client';

const log = createLogger('admin:payroll');

/** Loose name match: every TeamTime name token appears in the NRS name tokens. */
function nameTokens(s: string): string[] {
	return s
		.toLowerCase()
		.replace(/[^a-z\s]/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length > 1);
}
function suggestEmployee(userName: string, employees: NrsEmployee[]): NrsEmployee | null {
	const want = nameTokens(userName);
	if (want.length === 0) return null;
	const matches = employees.filter((e) => {
		const have = new Set(nameTokens(`${e.firstName} ${e.lastName} ${e.displayName}`));
		return want.every((t) => have.has(t));
	});
	return matches.length === 1 ? matches[0] : null; // only suggest when unambiguous
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const config = await getPayPeriodConfig();
	const periods = listRecentPayPeriods(config, 8);
	const current = getCurrentPayPeriod(config);

	// Selected period: ?start&?end, else the most recently completed one.
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');
	let selected = periods.find(
		(p) => toPacificDateString(p.startDate) === startParam && toPacificDateString(p.endDate) === endParam
	);
	if (!selected) selected = periods.find((p) => !p.isCurrent) ?? periods[0] ?? current ?? undefined;

	if (!selected) {
		return {
			unsupportedConfig: true,
			periods: [],
			rows: [],
			earningTypes: NRS_EARNING_TYPES,
			nrsError: null,
			employees: [],
			selected: null
		};
	}

	const rows = await computePayrollForPeriod(selected.startDate, selected.endDate);

	// NRS roster for mapping (best-effort — the report still works if NRS is down).
	let employees: NrsEmployee[] = [];
	let nrsError: string | null = null;
	try {
		employees = await getEmployees(true);
	} catch (err) {
		nrsError = err instanceof Error ? err.message : 'Could not reach NRS';
		log.warn({ err }, 'NRS employee/list failed — mapping suggestions unavailable');
	}
	const byNrsId = new Map(employees.map((e) => [e.employeeId, e]));

	const enriched = rows.map((r) => {
		const mapped = r.nrsEmployeeId != null ? byNrsId.get(r.nrsEmployeeId) : undefined;
		const suggestion = r.nrsEmployeeId == null ? suggestEmployee(r.name, employees) : null;
		return {
			...r,
			nrsNumber: mapped?.number ?? null,
			nrsName: mapped?.displayName ?? null,
			suggestion: suggestion ? { employeeId: suggestion.employeeId, displayName: suggestion.displayName, number: suggestion.number } : null
		};
	});

	return {
		unsupportedConfig: false,
		selected: {
			start: toPacificDateString(selected.startDate),
			end: toPacificDateString(selected.endDate),
			label: selected.label,
			isCurrent: selected.isCurrent
		},
		periods: periods.map((p) => ({
			start: toPacificDateString(p.startDate),
			end: toPacificDateString(p.endDate),
			label: p.label,
			isCurrent: p.isCurrent
		})),
		rows: enriched,
		earningTypes: NRS_EARNING_TYPES,
		employees: employees.map((e) => ({ employeeId: e.employeeId, displayName: e.displayName, number: e.number })),
		nrsError,
		totals: {
			regular: Math.round(enriched.reduce((s, r) => s + r.regularHours, 0) * 100) / 100,
			overtime: Math.round(enriched.reduce((s, r) => s + r.overtimeHours, 0) * 100) / 100,
			unmapped: enriched.filter((r) => r.nrsEmployeeId == null).length
		}
	};
};

export const actions: Actions = {
	// Bind (or clear) a TeamTime user to an NRS employee id.
	map: async ({ request, locals }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const form = await request.formData();
		const userId = form.get('userId')?.toString();
		const raw = form.get('nrsEmployeeId')?.toString() ?? '';
		if (!userId) return fail(400, { error: 'userId required' });

		const nrsEmployeeId = raw === '' ? null : Number(raw);
		if (nrsEmployeeId !== null && !Number.isInteger(nrsEmployeeId)) {
			return fail(400, { error: 'Invalid NRS employee id' });
		}

		try {
			await db.update(users).set({ nrsEmployeeId, updatedAt: new Date() }).where(eq(users.id, userId));
		} catch {
			// unique violation — that NRS employee is already mapped to someone else
			return fail(400, { error: 'That NRS employee is already mapped to another user' });
		}
		return { success: true };
	}
};
