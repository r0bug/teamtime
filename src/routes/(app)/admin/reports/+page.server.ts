import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, timeEntries, atmWithdrawals, withdrawalAllocations, users, purchaseRequests, appSettings } from '$lib/server/db';
import { sql, gte, lte, and, eq, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

interface PayPeriodConfig {
	type: 'semi-monthly' | 'bi-weekly' | 'weekly' | 'monthly';
	period1Start: number;
	period1End: number;
	period1Payday: number;
	period2Start: number;
	period2End: number;
	period2Payday: number;
}

interface PayPeriod {
	startDate: Date;
	endDate: Date;
	payday: Date;
	label: string;
	isCurrent: boolean;
}

const DEFAULT_CONFIG: PayPeriodConfig = {
	type: 'semi-monthly',
	period1Start: 26,
	period1End: 10,
	period1Payday: 1,
	period2Start: 11,
	period2End: 25,
	period2Payday: 16
};

function calculatePayPeriods(config: PayPeriodConfig, count: number): PayPeriod[] {
	const periods: PayPeriod[] = [];
	const now = new Date();
	const currentMonth = now.getMonth();
	const currentYear = now.getFullYear();

	if (config.type === 'semi-monthly') {
		for (let monthOffset = -3; monthOffset <= 1; monthOffset++) {
			const targetMonth = currentMonth + monthOffset;
			const targetYear = currentYear + Math.floor(targetMonth / 12);
			const adjustedMonth = ((targetMonth % 12) + 12) % 12;

			// Period 1: crosses month boundary (e.g., 26th to 10th)
			if (config.period1Start > config.period1End) {
				const startDate = new Date(targetYear, adjustedMonth - 1, config.period1Start);
				const endDate = new Date(targetYear, adjustedMonth, config.period1End, 23, 59, 59);
				const payday = new Date(targetYear, adjustedMonth, config.period1Payday);
				const isCurrent = now >= startDate && now <= endDate;

				periods.push({
					startDate,
					endDate,
					payday,
					label: `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`,
					isCurrent
				});
			}

			// Period 2: within same month (e.g., 11th to 25th)
			const p2StartDate = new Date(targetYear, adjustedMonth, config.period2Start);
			const p2EndDate = new Date(targetYear, adjustedMonth, config.period2End, 23, 59, 59);
			const p2Payday = new Date(targetYear, adjustedMonth, config.period2Payday);
			const p2IsCurrent = now >= p2StartDate && now <= p2EndDate;

			periods.push({
				startDate: p2StartDate,
				endDate: p2EndDate,
				payday: p2Payday,
				label: `${formatShortDate(p2StartDate)} - ${formatShortDate(p2EndDate)}`,
				isCurrent: p2IsCurrent
			});
		}
	}

	periods.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
	return periods.slice(0, count);
}

function formatShortDate(date: Date): string {
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Load pay period config
	const setting = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'pay_period_config'))
		.limit(1);

	let payPeriodConfig: PayPeriodConfig = DEFAULT_CONFIG;
	if (setting.length > 0) {
		try {
			payPeriodConfig = JSON.parse(setting[0].value);
		} catch {
			payPeriodConfig = DEFAULT_CONFIG;
		}
	}

	const payPeriods = calculatePayPeriods(payPeriodConfig, 8);

	// Get date range from query params or default to current pay period
	const startParam = url.searchParams.get('start');
	const endParam = url.searchParams.get('end');
	const reportType = url.searchParams.get('type') || 'hours';

	let startDate: Date;
	let endDate: Date;

	if (startParam && endParam) {
		endDate = new Date(endParam + 'T23:59:59');
		startDate = new Date(startParam + 'T00:00:00');
	} else {
		// Default to current pay period
		const currentPeriod = payPeriods.find(p => p.isCurrent) || payPeriods[0];
		if (currentPeriod) {
			startDate = currentPeriod.startDate;
			endDate = currentPeriod.endDate;
		} else {
			endDate = new Date();
			startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
		}
	}

	// Employee Hours Report
	const hoursData = await db
		.select({
			userId: users.id,
			userName: users.name,
			userEmail: users.email,
			hourlyRate: users.hourlyRate,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			entryId: timeEntries.id
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(and(
			gte(timeEntries.clockIn, startDate),
			lte(timeEntries.clockIn, endDate)
		))
		.orderBy(users.name, desc(timeEntries.clockIn));

	// Aggregate hours by employee
	const employeeHoursMap = new Map<string, {
		userId: string;
		name: string;
		email: string;
		hourlyRate: number | null;
		totalHours: number;
		totalPay: number;
		entries: number;
		days: Set<string>;
	}>();

	for (const entry of hoursData) {
		const key = entry.userId;
		if (!employeeHoursMap.has(key)) {
			employeeHoursMap.set(key, {
				userId: entry.userId,
				name: entry.userName,
				email: entry.userEmail,
				hourlyRate: entry.hourlyRate ? parseFloat(entry.hourlyRate) : null,
				totalHours: 0,
				totalPay: 0,
				entries: 0,
				days: new Set()
			});
		}

		const emp = employeeHoursMap.get(key)!;
		emp.entries++;

		if (entry.clockIn) {
			emp.days.add(new Date(entry.clockIn).toISOString().split('T')[0]);
		}

		if (entry.clockIn && entry.clockOut) {
			const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
			emp.totalHours += hours;
			if (emp.hourlyRate) {
				emp.totalPay += hours * emp.hourlyRate;
			}
		}
	}

	const employeeHours = Array.from(employeeHoursMap.values()).map(emp => ({
		...emp,
		daysWorked: emp.days.size,
		avgHoursPerDay: emp.days.size > 0 ? emp.totalHours / emp.days.size : 0
	}));

	// Time entries detail for the selected date range
	const timeEntriesDetail = hoursData.map(entry => {
		const hours = entry.clockIn && entry.clockOut
			? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
			: null;
		const rate = entry.hourlyRate ? parseFloat(entry.hourlyRate) : null;
		return {
			id: entry.entryId,
			userName: entry.userName,
			clockIn: entry.clockIn,
			clockOut: entry.clockOut,
			hours,
			hourlyRate: rate,
			pay: hours && rate ? hours * rate : null
		};
	});

	// Expense Report - Withdrawals
	const withdrawals = await db
		.select({
			id: atmWithdrawals.id,
			userId: atmWithdrawals.userId,
			userName: users.name,
			amount: atmWithdrawals.amount,
			withdrawnAt: atmWithdrawals.withdrawnAt,
			status: atmWithdrawals.status,
			notes: atmWithdrawals.notes
		})
		.from(atmWithdrawals)
		.innerJoin(users, eq(atmWithdrawals.userId, users.id))
		.where(and(
			gte(atmWithdrawals.withdrawnAt, startDate),
			lte(atmWithdrawals.withdrawnAt, endDate)
		))
		.orderBy(desc(atmWithdrawals.withdrawnAt));

	// Get allocations for each withdrawal
	const withdrawalIds = withdrawals.map(w => w.id);
	const allocations = withdrawalIds.length > 0
		? await db
			.select({
				withdrawalId: withdrawalAllocations.withdrawalId,
				amount: withdrawalAllocations.amount,
				productDescription: withdrawalAllocations.productDescription
			})
			.from(withdrawalAllocations)
		: [];

	// Map allocations to withdrawals
	const withdrawalsWithAllocations = withdrawals.map(w => {
		const allocs = allocations.filter(a => a.withdrawalId === w.id);
		const allocatedAmount = allocs.reduce((sum, a) => sum + parseFloat(a.amount || '0'), 0);
		return {
			...w,
			amount: parseFloat(w.amount || '0'),
			allocatedAmount,
			unallocatedAmount: parseFloat(w.amount || '0') - allocatedAmount,
			allocations: allocs.map(a => ({
				amount: parseFloat(a.amount || '0'),
				description: a.productDescription
			}))
		};
	});

	// Purchase Requests in date range
	const purchases = await db
		.select({
			id: purchaseRequests.id,
			description: purchaseRequests.description,
			proposedPrice: purchaseRequests.proposedPrice,
			status: purchaseRequests.status,
			requesterName: users.name,
			createdAt: purchaseRequests.createdAt,
			decidedAt: purchaseRequests.decidedAt
		})
		.from(purchaseRequests)
		.innerJoin(users, eq(purchaseRequests.requesterId, users.id))
		.where(and(
			gte(purchaseRequests.createdAt, startDate),
			lte(purchaseRequests.createdAt, endDate)
		))
		.orderBy(desc(purchaseRequests.createdAt));

	// Summary stats
	const totalHours = employeeHours.reduce((sum, emp) => sum + emp.totalHours, 0);
	const totalPay = employeeHours.reduce((sum, emp) => sum + emp.totalPay, 0);
	const totalWithdrawn = withdrawalsWithAllocations.reduce((sum, w) => sum + w.amount, 0);
	const totalAllocated = withdrawalsWithAllocations.reduce((sum, w) => sum + w.allocatedAmount, 0);
	const totalPurchases = purchases.reduce((sum, p) => sum + parseFloat(p.proposedPrice || '0'), 0);
	const approvedPurchases = purchases.filter(p => p.status === 'approved');
	const pendingPurchases = purchases.filter(p => p.status === 'pending');

	return {
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		reportType,
		// Pay periods for quick selection
		payPeriods: payPeriods.map(p => ({
			startDate: p.startDate.toISOString().split('T')[0],
			endDate: p.endDate.toISOString().split('T')[0],
			payday: p.payday.toISOString().split('T')[0],
			label: p.label,
			isCurrent: p.isCurrent
		})),
		// Hours report data
		employeeHours,
		timeEntriesDetail,
		hoursSummary: {
			totalHours,
			totalPay,
			totalEntries: hoursData.length,
			employeeCount: employeeHours.length
		},
		// Expense report data
		withdrawals: withdrawalsWithAllocations,
		purchases: purchases.map(p => ({
			...p,
			proposedPrice: parseFloat(p.proposedPrice || '0')
		})),
		expenseSummary: {
			totalWithdrawn,
			totalAllocated,
			unallocated: totalWithdrawn - totalAllocated,
			withdrawalCount: withdrawals.length,
			totalPurchases,
			approvedCount: approvedPurchases.length,
			pendingCount: pendingPurchases.length,
			deniedCount: purchases.filter(p => p.status === 'denied').length
		}
	};
};
