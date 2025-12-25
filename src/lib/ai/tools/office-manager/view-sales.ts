/**
 * @module AI/Tools/ViewSales
 * @description AI tool for querying sales data and calculating profitability.
 *
 * Retrieves sales snapshots for a given date, optionally calculating labor costs
 * based on staff time entries to determine net profitability.
 *
 * Features:
 * - Sales totals by vendor
 * - Retained amount calculations
 * - Labor cost analysis when includeLabor=true
 * - Net profit/loss calculation
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for day boundaries.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 */
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { eq, desc, gte, lte, and, isNull } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { getPacificDayBounds } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:view-sales');

interface ViewSalesParams {
	date?: string; // YYYY-MM-DD, defaults to today
	includeLabor?: boolean; // Calculate labor costs for profitability
}

interface VendorSummary {
	vendorId: string;
	vendorName: string;
	totalSales: number;
	vendorAmount: number;
	retainedAmount: number;
}

interface LaborSummary {
	userName: string;
	userId: string;
	hoursWorked: number;
	hourlyRate: number;
	laborCost: number;
}

interface ViewSalesResult {
	success: boolean;
	date?: string;
	snapshotTime?: string;

	// Sales totals
	totalSales?: number;
	totalVendorAmount?: number;
	totalRetained?: number;
	vendorCount?: number;

	// Top vendors
	topVendors?: VendorSummary[];

	// Labor (if requested)
	labor?: {
		totalHours: number;
		totalLaborCost: number;
		workers: LaborSummary[];
	};

	// Profitability
	profitability?: {
		grossRetained: number;
		laborCost: number;
		netProfit: number;
		profitMargin: number; // percentage
		status: 'profit' | 'loss' | 'break-even';
	};

	error?: string;
}

// Calculate hours from time entries for a date
async function calculateLaborForDate(date: string): Promise<{ hours: number; cost: number; workers: LaborSummary[] }> {
	// Get start and end of the day in Pacific timezone
	const { start: dayStart, end: dayEnd } = getPacificDayBounds(new Date(date + 'T12:00:00'));

	// Get time entries for the day
	const entries = await db
		.select({
			userId: timeEntries.userId,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			userName: users.name,
			hourlyRate: users.hourlyRate
		})
		.from(timeEntries)
		.innerJoin(users, eq(timeEntries.userId, users.id))
		.where(
			and(
				gte(timeEntries.clockIn, dayStart),
				lte(timeEntries.clockIn, dayEnd)
			)
		);

	const workerMap = new Map<string, LaborSummary>();

	for (const entry of entries) {
		const clockOut = entry.clockOut || new Date(); // Use current time if still clocked in
		const hoursWorked = (clockOut.getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60);
		const hourlyRate = entry.hourlyRate ? parseFloat(entry.hourlyRate) : 15; // Default $15/hr
		const laborCost = hoursWorked * hourlyRate;

		const existing = workerMap.get(entry.userId);
		if (existing) {
			existing.hoursWorked += hoursWorked;
			existing.laborCost += laborCost;
		} else {
			workerMap.set(entry.userId, {
				userName: entry.userName,
				userId: entry.userId,
				hoursWorked,
				hourlyRate,
				laborCost
			});
		}
	}

	const workers = Array.from(workerMap.values());
	const totalHours = workers.reduce((sum, w) => sum + w.hoursWorked, 0);
	const totalCost = workers.reduce((sum, w) => sum + w.laborCost, 0);

	return { hours: totalHours, cost: totalCost, workers };
}

export const viewSalesTool: AITool<ViewSalesParams, ViewSalesResult> = {
	name: 'view_sales',
	description: 'View sales data and profitability for a specific date. Shows total sales, retained earnings, and optionally calculates labor costs to determine if we are profitable for the day.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			date: {
				type: 'string',
				description: 'Date to view sales for (YYYY-MM-DD format). Defaults to today.'
			},
			includeLabor: {
				type: 'boolean',
				description: 'If true, also calculate labor costs and show profitability. Default true.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ViewSalesParams) {
		if (params.date) {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(params.date)) {
				return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
			}
		}
		return { valid: true };
	},

	async execute(params: ViewSalesParams, context: ToolExecutionContext): Promise<ViewSalesResult> {
		try {
			// Default to today
			const date = params.date || new Date().toISOString().split('T')[0];
			const includeLabor = params.includeLabor !== false; // Default true

			// Get the latest snapshot for this date
			const [snapshot] = await db
				.select()
				.from(salesSnapshots)
				.where(eq(salesSnapshots.saleDate, date))
				.orderBy(desc(salesSnapshots.capturedAt))
				.limit(1);

			if (!snapshot) {
				return {
					success: true,
					date,
					error: `No sales data available for ${date}`
				};
			}

			const totalSales = parseFloat(snapshot.totalSales);
			const totalVendorAmount = parseFloat(snapshot.totalVendorAmount);
			const totalRetained = parseFloat(snapshot.totalRetained);

			// Get top 5 vendors by retained amount
			const vendors = (snapshot.vendors as { vendor_id: string; vendor_name: string; total_sales: number; vendor_amount: number; retained_amount: number }[]) || [];
			const topVendors = vendors
				.sort((a, b) => b.retained_amount - a.retained_amount)
				.slice(0, 5)
				.map(v => ({
					vendorId: v.vendor_id,
					vendorName: v.vendor_name,
					totalSales: v.total_sales,
					vendorAmount: v.vendor_amount,
					retainedAmount: v.retained_amount
				}));

			const result: ViewSalesResult = {
				success: true,
				date,
				snapshotTime: snapshot.capturedAt.toISOString(),
				totalSales,
				totalVendorAmount,
				totalRetained,
				vendorCount: snapshot.vendorCount,
				topVendors
			};

			// Calculate labor if requested
			if (includeLabor) {
				const labor = await calculateLaborForDate(date);

				result.labor = {
					totalHours: Math.round(labor.hours * 100) / 100,
					totalLaborCost: Math.round(labor.cost * 100) / 100,
					workers: labor.workers.map(w => ({
						...w,
						hoursWorked: Math.round(w.hoursWorked * 100) / 100,
						laborCost: Math.round(w.laborCost * 100) / 100
					}))
				};

				// Calculate profitability
				const netProfit = totalRetained - labor.cost;
				const profitMargin = totalRetained > 0 ? (netProfit / totalRetained) * 100 : 0;

				result.profitability = {
					grossRetained: totalRetained,
					laborCost: Math.round(labor.cost * 100) / 100,
					netProfit: Math.round(netProfit * 100) / 100,
					profitMargin: Math.round(profitMargin * 10) / 10,
					status: netProfit > 0 ? 'profit' : netProfit < 0 ? 'loss' : 'break-even'
				};
			}

			return result;
		} catch (error) {
			log.error({ error }, 'View sales tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ViewSalesResult): string {
		if (!result.success) {
			return `Failed to view sales: ${result.error}`;
		}

		if (result.error) {
			return result.error;
		}

		let output = `Sales for ${result.date} (as of ${result.snapshotTime?.split('T')[1]?.slice(0, 5) || 'unknown'}):\n`;
		output += `\nTotal Sales: $${result.totalSales?.toFixed(2)}`;
		output += `\nVendor Payouts: $${result.totalVendorAmount?.toFixed(2)}`;
		output += `\nRetained Earnings: $${result.totalRetained?.toFixed(2)}`;
		output += `\nActive Vendors: ${result.vendorCount}`;

		if (result.topVendors && result.topVendors.length > 0) {
			output += `\n\nTop Vendors by Retained:`;
			for (const v of result.topVendors) {
				output += `\n  - ${v.vendorName}: $${v.retainedAmount.toFixed(2)} (from $${v.totalSales.toFixed(2)} sales)`;
			}
		}

		if (result.labor) {
			output += `\n\nLabor Summary:`;
			output += `\n  Total Hours: ${result.labor.totalHours.toFixed(1)}h`;
			output += `\n  Labor Cost: $${result.labor.totalLaborCost.toFixed(2)}`;
			if (result.labor.workers.length > 0) {
				output += `\n  Workers:`;
				for (const w of result.labor.workers) {
					output += `\n    - ${w.userName}: ${w.hoursWorked.toFixed(1)}h @ $${w.hourlyRate}/hr = $${w.laborCost.toFixed(2)}`;
				}
			}
		}

		if (result.profitability) {
			const p = result.profitability;
			const emoji = p.status === 'profit' ? '+' : p.status === 'loss' ? '-' : '=';
			output += `\n\n${emoji} PROFITABILITY:`;
			output += `\n  Retained: $${p.grossRetained.toFixed(2)}`;
			output += `\n  Labor: -$${p.laborCost.toFixed(2)}`;
			output += `\n  Net: $${p.netProfit.toFixed(2)} (${p.profitMargin.toFixed(1)}% margin)`;
			output += `\n  Status: ${p.status.toUpperCase()}`;
		}

		return output;
	}
};
