// Sales Context Provider - Recent sales data and trends for AI agents
import { db, salesSnapshots, timeEntries, users } from '$lib/server/db';
import { and, gte, lte, desc, eq, isNotNull } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';
import type { VendorSalesData } from '$lib/server/db/schema';
import { getPacificDayBounds, toPacificDateString } from '$lib/server/utils/timezone';

interface DaySales {
	date: string;
	totalSales: number;
	totalRetained: number;
	vendorCount: number;
	laborHours: number;
	laborCost: number;
	netProfit: number;
	salesPerLaborHour: number;
	topVendors: { name: string; sales: number; retained: number }[];
}

interface SalesContextData {
	yesterday: DaySales | null;
	weekToDate: {
		totalSales: number;
		totalRetained: number;
		totalLaborCost: number;
		netProfit: number;
		daysWithData: number;
		avgDailySales: number;
		avgSalesPerLaborHour: number;
	};
	recentDays: DaySales[];
	trend: {
		direction: 'up' | 'down' | 'flat';
		percentChange: number;
		comparedTo: string;
	};
	summary: {
		daysWithData: number;
		hasSalesData: number;
	};
}

export const salesProvider: AIContextProvider<SalesContextData> = {
	moduleId: 'sales',
	moduleName: 'Sales & Revenue',
	description: 'Recent sales data, trends, and profitability metrics from NRS scrapes',
	priority: 22, // After attendance (20), before tasks (25)
	agents: ['office_manager', 'revenue_optimizer'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<SalesContextData> {
		const now = new Date();
		const today = toPacificDateString(now);

		// Get last 14 days of snapshots
		const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
		const startStr = toPacificDateString(fourteenDaysAgo);

		const snapshots = await db
			.select()
			.from(salesSnapshots)
			.where(
				and(
					gte(salesSnapshots.saleDate, startStr),
					lte(salesSnapshots.saleDate, today)
				)
			)
			.orderBy(desc(salesSnapshots.saleDate), desc(salesSnapshots.capturedAt));

		// Dedupe to latest snapshot per day
		const dailySnapshots = new Map<string, typeof snapshots[0]>();
		for (const s of snapshots) {
			if (!dailySnapshots.has(s.saleDate)) {
				dailySnapshots.set(s.saleDate, s);
			}
		}

		// Get time entries for the same period
		const entries = await db
			.select({
				clockIn: timeEntries.clockIn,
				clockOut: timeEntries.clockOut,
				hourlyRate: users.hourlyRate
			})
			.from(timeEntries)
			.innerJoin(users, eq(timeEntries.userId, users.id))
			.where(
				and(
					gte(timeEntries.clockIn, fourteenDaysAgo),
					lte(timeEntries.clockIn, now),
					isNotNull(timeEntries.clockOut)
				)
			);

		// Group labor by date
		const laborByDate = new Map<string, { hours: number; cost: number }>();
		for (const entry of entries) {
			if (!entry.clockOut) continue;
			const dateStr = toPacificDateString(new Date(entry.clockIn));
			const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
			const rate = entry.hourlyRate ? parseFloat(entry.hourlyRate) : 15;
			const existing = laborByDate.get(dateStr) || { hours: 0, cost: 0 };
			existing.hours += hours;
			existing.cost += hours * rate;
			laborByDate.set(dateStr, existing);
		}

		// Build daily sales data
		const recentDays: DaySales[] = [];
		for (const [dateKey, snapshot] of dailySnapshots) {
			const totalSales = parseFloat(snapshot.totalSales);
			const totalRetained = parseFloat(snapshot.totalRetained);
			const labor = laborByDate.get(dateKey) || { hours: 0, cost: 0 };
			const vendors = (snapshot.vendors as VendorSalesData[]) || [];

			const topVendors = vendors
				.sort((a, b) => b.retained_amount - a.retained_amount)
				.slice(0, 3)
				.map(v => ({
					name: v.vendor_name,
					sales: v.total_sales,
					retained: v.retained_amount
				}));

			recentDays.push({
				date: dateKey,
				totalSales,
				totalRetained,
				vendorCount: snapshot.vendorCount,
				laborHours: Math.round(labor.hours * 10) / 10,
				laborCost: Math.round(labor.cost * 100) / 100,
				netProfit: Math.round((totalRetained - labor.cost) * 100) / 100,
				salesPerLaborHour: labor.hours > 0 ? Math.round((totalSales / labor.hours) * 100) / 100 : 0,
				topVendors
			});
		}

		// Sort ascending by date
		recentDays.sort((a, b) => a.date.localeCompare(b.date));

		// Yesterday's data
		const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const yesterdayStr = toPacificDateString(yesterdayDate);
		const yesterday = recentDays.find(d => d.date === yesterdayStr) || null;

		// Week-to-date (last 7 days)
		const sevenDaysAgo = toPacificDateString(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
		const wtdDays = recentDays.filter(d => d.date >= sevenDaysAgo);
		const wtdTotalSales = wtdDays.reduce((s, d) => s + d.totalSales, 0);
		const wtdTotalRetained = wtdDays.reduce((s, d) => s + d.totalRetained, 0);
		const wtdTotalLaborCost = wtdDays.reduce((s, d) => s + d.laborCost, 0);
		const wtdTotalLaborHours = wtdDays.reduce((s, d) => s + d.laborHours, 0);

		// Trend: compare last 7 days vs prior 7 days
		const priorDays = recentDays.filter(d => d.date < sevenDaysAgo);
		const priorAvg = priorDays.length > 0
			? priorDays.reduce((s, d) => s + d.totalSales, 0) / priorDays.length
			: 0;
		const currentAvg = wtdDays.length > 0 ? wtdTotalSales / wtdDays.length : 0;
		const percentChange = priorAvg > 0 ? ((currentAvg - priorAvg) / priorAvg) * 100 : 0;

		return {
			yesterday,
			weekToDate: {
				totalSales: Math.round(wtdTotalSales * 100) / 100,
				totalRetained: Math.round(wtdTotalRetained * 100) / 100,
				totalLaborCost: Math.round(wtdTotalLaborCost * 100) / 100,
				netProfit: Math.round((wtdTotalRetained - wtdTotalLaborCost) * 100) / 100,
				daysWithData: wtdDays.length,
				avgDailySales: wtdDays.length > 0 ? Math.round(currentAvg * 100) / 100 : 0,
				avgSalesPerLaborHour: wtdTotalLaborHours > 0
					? Math.round((wtdTotalSales / wtdTotalLaborHours) * 100) / 100
					: 0
			},
			recentDays: recentDays.slice(-7), // Last 7 days for context
			trend: {
				direction: percentChange > 2 ? 'up' : percentChange < -2 ? 'down' : 'flat',
				percentChange: Math.round(percentChange * 10) / 10,
				comparedTo: 'prior 7 days'
			},
			summary: {
				daysWithData: recentDays.length,
				hasSalesData: recentDays.length > 0 ? 1 : 0
			}
		};
	},

	estimateTokens(context: SalesContextData): number {
		// ~100 base + ~60 per day of data
		return 100 + context.recentDays.length * 60 + (context.yesterday ? 80 : 0);
	},

	formatForPrompt(context: SalesContextData): string {
		const lines: string[] = ['## Sales & Revenue'];

		if (context.recentDays.length === 0) {
			lines.push('No sales data available for the past 14 days.');
			return lines.join('\n');
		}

		// Yesterday's summary
		if (context.yesterday) {
			const y = context.yesterday;
			const profitLabel = y.netProfit >= 0 ? 'profit' : 'loss';
			lines.push(`### Yesterday (${y.date})`);
			lines.push(`- Sales: $${y.totalSales.toFixed(2)}, Retained: $${y.totalRetained.toFixed(2)}`);
			lines.push(`- Labor: ${y.laborHours}h / $${y.laborCost.toFixed(2)} cost`);
			lines.push(`- Net ${profitLabel}: $${Math.abs(y.netProfit).toFixed(2)} | $/labor-hr: $${y.salesPerLaborHour.toFixed(2)}`);
			if (y.topVendors.length > 0) {
				lines.push(`- Top vendors: ${y.topVendors.map(v => `${v.name} ($${v.retained.toFixed(0)} retained)`).join(', ')}`);
			}
			lines.push('');
		}

		// Week-to-date
		const w = context.weekToDate;
		if (w.daysWithData > 0) {
			const profitLabel = w.netProfit >= 0 ? 'profit' : 'loss';
			lines.push(`### Week-to-Date (${w.daysWithData} days)`);
			lines.push(`- Total Sales: $${w.totalSales.toFixed(2)}, Retained: $${w.totalRetained.toFixed(2)}`);
			lines.push(`- Labor Cost: $${w.totalLaborCost.toFixed(2)}, Net ${profitLabel}: $${Math.abs(w.netProfit).toFixed(2)}`);
			lines.push(`- Avg daily sales: $${w.avgDailySales.toFixed(2)} | Avg $/labor-hr: $${w.avgSalesPerLaborHour.toFixed(2)}`);
			lines.push('');
		}

		// Trend
		const t = context.trend;
		const arrow = t.direction === 'up' ? '+' : t.direction === 'down' ? '' : '';
		lines.push(`### Trend: ${t.direction.toUpperCase()} ${arrow}${t.percentChange}% vs ${t.comparedTo}`);
		lines.push('');

		// Recent daily breakdown
		lines.push('### Recent Days');
		for (const d of context.recentDays) {
			const profitIndicator = d.netProfit >= 0 ? '+' : '';
			lines.push(`- ${d.date}: Sales $${d.totalSales.toFixed(0)}, Retained $${d.totalRetained.toFixed(0)}, Labor $${d.laborCost.toFixed(0)}, Net ${profitIndicator}$${d.netProfit.toFixed(0)}, ${d.vendorCount} vendors`);
		}

		return lines.join('\n');
	}
};
