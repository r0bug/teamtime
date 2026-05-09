// Get Vendor Recent Sales Tool - Read-only sales rollup for one vendor
import { db, vendors, salesTransactions } from '$lib/server/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:get-vendor-recent-sales');

interface GetVendorRecentSalesParams {
	vendorId: string;
	daysBack?: number;
}

interface DayBucket {
	date: string;
	grossCents: number;
	units: number;
}

interface TopItem {
	partNumber: string | null;
	partName: string | null;
	units: number;
	grossCents: number;
}

interface GetVendorRecentSalesResult {
	success: boolean;
	vendorId?: string;
	vendorDisplayName?: string;
	nrsVendorId?: number | null;
	daysBack?: number;
	rangeStart?: string;
	rangeEnd?: string;
	totalGrossCents?: number;
	totalUnits?: number;
	transactionCount?: number;
	byDay?: DayBucket[];
	topItems?: TopItem[];
	error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}

function todayPacificDateString(): string {
	// Use local-zone date formatting; the spec asks for daysBack from "today"
	// — Pacific is the canonical zone for this app.
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	return formatter.format(now); // YYYY-MM-DD
}

function subtractDays(yyyymmdd: string, days: number): string {
	const [y, m, d] = yyyymmdd.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() - days);
	const yy = dt.getUTCFullYear();
	const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(dt.getUTCDate()).padStart(2, '0');
	return `${yy}-${mm}-${dd}`;
}

function makeBar(value: number, max: number, width: number = 20): string {
	if (max <= 0) return '';
	const filled = Math.round((value / max) * width);
	return '#'.repeat(filled) + '.'.repeat(width - filled);
}

export const getVendorRecentSalesTool: AITool<GetVendorRecentSalesParams, GetVendorRecentSalesResult> = {
	name: 'get_vendor_recent_sales',
	description: 'Get a sales rollup for a single vendor over the last N days (default 30). Returns total gross, total units, transaction count, daily breakdown, and the vendor\'s top-selling items. Use to answer "how is booth 12 doing this month?" or "what are this vendor\'s top sellers?".',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			vendorId: {
				type: 'string',
				description: 'TeamTime vendor UUID. Required.'
			},
			daysBack: {
				type: 'number',
				description: 'How many days of history to include (1-365). Default 30.'
			}
		},
		required: ['vendorId']
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: GetVendorRecentSalesParams) {
		if (!params.vendorId || !UUID_RE.test(params.vendorId)) {
			return { valid: false, error: 'vendorId must be a valid UUID' };
		}
		if (params.daysBack !== undefined) {
			if (typeof params.daysBack !== 'number' || params.daysBack < 1) {
				return { valid: false, error: 'daysBack must be a positive number' };
			}
		}
		return { valid: true };
	},

	async execute(params: GetVendorRecentSalesParams, _context: ToolExecutionContext): Promise<GetVendorRecentSalesResult> {
		try {
			const daysBack = Math.min(params.daysBack ?? 30, 365);
			const rangeEnd = todayPacificDateString();
			const rangeStart = subtractDays(rangeEnd, daysBack - 1); // inclusive of today

			// Resolve vendor → nrsVendorId
			const [vendorRow] = await db
				.select({
					id: vendors.id,
					displayName: vendors.displayName,
					nrsVendorId: vendors.nrsVendorId
				})
				.from(vendors)
				.where(eq(vendors.id, params.vendorId))
				.limit(1);

			if (!vendorRow) {
				return { success: false, error: 'Vendor not found.' };
			}
			if (vendorRow.nrsVendorId === null) {
				return {
					success: true,
					vendorId: vendorRow.id,
					vendorDisplayName: vendorRow.displayName,
					nrsVendorId: null,
					daysBack,
					rangeStart,
					rangeEnd,
					totalGrossCents: 0,
					totalUnits: 0,
					transactionCount: 0,
					byDay: [],
					topItems: [],
					error: 'Vendor has no NRS vendor id linked, so no sales data is available.'
				};
			}

			const nrsId = vendorRow.nrsVendorId;

			// Aggregate totals + per-day buckets in a single query
			const dayRows = await db
				.select({
					date: salesTransactions.invoiceDate,
					grossCents: sql<number>`COALESCE(SUM(${salesTransactions.price} * ${salesTransactions.quantity} * 100), 0)::bigint`,
					units: sql<number>`COALESCE(SUM(${salesTransactions.quantity}), 0)::int`,
					txCount: sql<number>`COUNT(*)::int`
				})
				.from(salesTransactions)
				.where(
					and(
						eq(salesTransactions.vendorId, nrsId),
						gte(salesTransactions.invoiceDate, rangeStart)
					)
				)
				.groupBy(salesTransactions.invoiceDate)
				.orderBy(salesTransactions.invoiceDate);

			const byDay: DayBucket[] = dayRows.map(r => ({
				date: r.date,
				grossCents: Number(r.grossCents),
				units: Number(r.units)
			}));

			const totalGrossCents = byDay.reduce((s, d) => s + d.grossCents, 0);
			const totalUnits = byDay.reduce((s, d) => s + d.units, 0);
			const transactionCount = dayRows.reduce((s, r) => s + Number(r.txCount), 0);

			// Top items by gross
			const itemRows = await db
				.select({
					partNumber: salesTransactions.partNumber,
					partName: salesTransactions.partName,
					units: sql<number>`COALESCE(SUM(${salesTransactions.quantity}), 0)::int`,
					grossCents: sql<number>`COALESCE(SUM(${salesTransactions.price} * ${salesTransactions.quantity} * 100), 0)::bigint`
				})
				.from(salesTransactions)
				.where(
					and(
						eq(salesTransactions.vendorId, nrsId),
						gte(salesTransactions.invoiceDate, rangeStart)
					)
				)
				.groupBy(salesTransactions.partNumber, salesTransactions.partName)
				.orderBy(sql`SUM(${salesTransactions.price} * ${salesTransactions.quantity}) DESC`)
				.limit(10);

			const topItems: TopItem[] = itemRows.map(r => ({
				partNumber: r.partNumber,
				partName: r.partName,
				units: Number(r.units),
				grossCents: Number(r.grossCents)
			}));

			return {
				success: true,
				vendorId: vendorRow.id,
				vendorDisplayName: vendorRow.displayName,
				nrsVendorId: nrsId,
				daysBack,
				rangeStart,
				rangeEnd,
				totalGrossCents,
				totalUnits,
				transactionCount,
				byDay,
				topItems
			};
		} catch (error) {
			log.error({ error }, 'Get vendor recent sales tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: GetVendorRecentSalesResult): string {
		if (!result.success) {
			return `Failed to get vendor sales: ${result.error}`;
		}
		const lines: string[] = [];
		lines.push(`Sales for ${result.vendorDisplayName} (${result.daysBack} days, ${result.rangeStart} → ${result.rangeEnd})`);

		if (result.error) {
			lines.push('');
			lines.push(result.error);
			return lines.join('\n');
		}

		const grossDollars = (result.totalGrossCents ?? 0) / 100;
		lines.push('');
		lines.push(`  Total gross: $${grossDollars.toFixed(2)}`);
		lines.push(`  Total units: ${result.totalUnits ?? 0}`);
		lines.push(`  Transactions: ${result.transactionCount ?? 0}`);

		const byDay = result.byDay ?? [];
		if (byDay.length === 0) {
			lines.push('');
			lines.push('  No sales in window.');
			return lines.join('\n');
		}

		// Last 7 days bar chart
		const last7 = byDay.slice(-7);
		const max7 = Math.max(...last7.map(d => d.grossCents), 0);
		lines.push('');
		lines.push('Last 7 days (gross):');
		for (const d of last7) {
			const dollars = (d.grossCents / 100).toFixed(2).padStart(8);
			const bar = makeBar(d.grossCents, max7);
			lines.push(`  ${d.date}  $${dollars}  ${bar}`);
		}

		const topItems = result.topItems ?? [];
		if (topItems.length > 0) {
			lines.push('');
			lines.push('Top items:');
			for (const it of topItems.slice(0, 5)) {
				const label = it.partName || it.partNumber || '(unknown item)';
				const code = it.partNumber ? ` [${it.partNumber}]` : '';
				lines.push(`  - ${label}${code}: ${it.units} units, $${(it.grossCents / 100).toFixed(2)}`);
			}
		}

		return lines.join('\n');
	}
};

// Suppress unused warning for helper retained for clarity / future use
void dollarsToCents;
