// TeamTime connector — resolve + render.
//
// Resolves vendor_id → 30-day sales (salesTransactions mirrors NRS line items
// keyed by the same NRS vendor id) and display name. renderData() feeds the
// sales heatmap injection (spec §3.4).
//
// TODO(leaderboard-rank): computeLeaderboard() builds the full board per
// call; wire a rank field here once a cheap per-vendor lookup exists.

import { and, gte, inArray, sql } from 'drizzle-orm';
import { db, vendors, salesTransactions } from '$lib/server/db';
import type { Connector, ConnectorResult } from './types';

const WINDOW_DAYS = 30;

function windowStart(): string {
	const d = new Date();
	d.setDate(d.getDate() - WINDOW_DAYS);
	return d.toISOString().slice(0, 10);
}

export const teamtimeConnector: Connector = {
	type: 'teamtime',
	joinAttribute: 'vendor_id',
	caps: { resolve: true, render: true },

	schema() {
		return [
			{ name: 'displayName', type: 'string' },
			{ name: 'sales30d', type: 'number' },
			{ name: 'transactions30d', type: 'number' }
		];
	},

	async resolve(keys: string[]): Promise<ConnectorResult> {
		const numeric = [...new Set(keys)].filter((k) => /^\d+$/.test(k)).map(Number);
		if (numeric.length === 0) return {};

		const [names, sales] = await Promise.all([
			db
				.select({ nrsVendorId: vendors.nrsVendorId, displayName: vendors.displayName })
				.from(vendors)
				.where(inArray(vendors.nrsVendorId, numeric)),
			db
				.select({
					vendorId: salesTransactions.vendorId,
					total: sql<string>`coalesce(sum(${salesTransactions.totalPrice}), 0)`,
					count: sql<number>`count(*)::int`
				})
				.from(salesTransactions)
				.where(and(inArray(salesTransactions.vendorId, numeric), gte(salesTransactions.invoiceDate, windowStart())))
				.groupBy(salesTransactions.vendorId)
		]);

		const out: ConnectorResult = {};
		for (const row of names) {
			out[String(row.nrsVendorId)] = { displayName: row.displayName, sales30d: 0, transactions30d: 0 };
		}
		for (const row of sales) {
			const key = String(row.vendorId);
			out[key] = { ...(out[key] ?? {}), sales30d: Number(row.total), transactions30d: row.count };
		}
		return out;
	},

	/** 30-day sales per vendor_id — the keyed table for heatmap injection. */
	async renderData(): Promise<Record<string, number>> {
		const rows = await db
			.select({
				vendorId: salesTransactions.vendorId,
				total: sql<string>`coalesce(sum(${salesTransactions.totalPrice}), 0)`
			})
			.from(salesTransactions)
			.where(gte(salesTransactions.invoiceDate, windowStart()))
			.groupBy(salesTransactions.vendorId);
		return Object.fromEntries(rows.map((r) => [String(r.vendorId), Number(r.total)]));
	}
};
