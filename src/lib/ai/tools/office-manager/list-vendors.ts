// List Vendors Tool - Read-only view of booth vendor roster
import { db, vendors, salesTransactions } from '$lib/server/db';
import { and, eq, ilike, or, max, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:list-vendors');

interface ListVendorsParams {
	activeOnly?: boolean;
	search?: string;
	limit?: number;
}

interface VendorRow {
	id: string;
	displayName: string;
	boothNumber: string | null;
	monthlyRentCents: number | null;
	vendorPaymentPercent: string | null;
	status: string;
	nrsVendorId: number | null;
	lastSeenInSales: string | null;
}

interface ListVendorsResult {
	success: boolean;
	vendors: VendorRow[];
	totalCount: number;
	error?: string;
}

function formatRentCents(cents: number | null): string {
	if (cents === null || cents === undefined) return '-';
	return `$${(cents / 100).toFixed(2)}`;
}

function formatPercent(pct: string | null): string {
	if (!pct) return '-';
	return `${parseFloat(pct).toFixed(1)}%`;
}

export const listVendorsTool: AITool<ListVendorsParams, ListVendorsResult> = {
	name: 'list_vendors',
	description: 'List booth vendors. Returns each vendor\'s booth number, display name, monthly rent, vendor payment %, status, NRS vendor id, and the last date they had a sale. Use to answer questions like "who are our vendors?", "find vendor in booth 5", or "which vendors haven\'t sold anything recently?".',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			activeOnly: {
				type: 'boolean',
				description: 'Only show vendors with status=active. Default true.'
			},
			search: {
				type: 'string',
				description: 'Case-insensitive substring match on displayName OR boothNumber.'
			},
			limit: {
				type: 'number',
				description: 'Max rows to return. Default 50, hard cap 200.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ListVendorsParams) {
		if (params.limit !== undefined && (typeof params.limit !== 'number' || params.limit < 1)) {
			return { valid: false, error: 'limit must be a positive number' };
		}
		return { valid: true };
	},

	async execute(params: ListVendorsParams, _context: ToolExecutionContext): Promise<ListVendorsResult> {
		try {
			const activeOnly = params.activeOnly !== false; // default true
			const limit = Math.min(params.limit ?? 50, 200);

			const whereClauses = [];
			if (activeOnly) {
				whereClauses.push(eq(vendors.status, 'active'));
			}
			if (params.search && params.search.trim()) {
				const pattern = `%${params.search.trim()}%`;
				whereClauses.push(
					or(
						ilike(vendors.displayName, pattern),
						ilike(vendors.boothNumber, pattern)
					)!
				);
			}

			const baseQuery = db
				.select({
					id: vendors.id,
					displayName: vendors.displayName,
					boothNumber: vendors.boothNumber,
					monthlyRentCents: vendors.monthlyRentCents,
					vendorPaymentPercent: vendors.vendorPaymentPercent,
					status: vendors.status,
					nrsVendorId: vendors.nrsVendorId,
					lastSeenInSales: max(salesTransactions.invoiceDate)
				})
				.from(vendors)
				.leftJoin(salesTransactions, eq(salesTransactions.vendorId, vendors.nrsVendorId))
				.groupBy(
					vendors.id,
					vendors.displayName,
					vendors.boothNumber,
					vendors.monthlyRentCents,
					vendors.vendorPaymentPercent,
					vendors.status,
					vendors.nrsVendorId
				)
				.orderBy(sql`${vendors.boothNumber} ASC NULLS LAST, ${vendors.displayName} ASC`)
				.limit(limit);

			const rows = whereClauses.length > 0
				? await baseQuery.where(and(...whereClauses))
				: await baseQuery;

			const vendorRows: VendorRow[] = rows.map(r => ({
				id: r.id,
				displayName: r.displayName,
				boothNumber: r.boothNumber,
				monthlyRentCents: r.monthlyRentCents,
				vendorPaymentPercent: r.vendorPaymentPercent,
				status: r.status,
				nrsVendorId: r.nrsVendorId,
				lastSeenInSales: r.lastSeenInSales ?? null
			}));

			return {
				success: true,
				vendors: vendorRows,
				totalCount: vendorRows.length
			};
		} catch (error) {
			log.error({ error }, 'List vendors tool error');
			return {
				success: false,
				vendors: [],
				totalCount: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ListVendorsResult): string {
		if (!result.success) {
			return `Failed to list vendors: ${result.error}`;
		}
		if (result.vendors.length === 0) {
			return 'No vendors found matching the criteria.';
		}

		const lines = [`Found ${result.totalCount} vendor(s):`, ''];
		// Header
		lines.push('Booth | Name | Rent | Pay% | Status | Last Sale');
		lines.push('------|------|------|------|--------|----------');
		for (const v of result.vendors) {
			const booth = v.boothNumber || '-';
			const rent = formatRentCents(v.monthlyRentCents);
			const pct = formatPercent(v.vendorPaymentPercent);
			const lastSale = v.lastSeenInSales || 'never';
			lines.push(`${booth} | ${v.displayName} | ${rent} | ${pct} | ${v.status} | ${lastSale}`);
		}
		return lines.join('\n');
	}
};
