// NRS connector — resolve-only, READ-ONLY. Never writes to NRS (spec §9).
//
// Resolves vendor_id (an NRS vendor id as text) → rent/status/name. Reads the
// LOCAL mirror (the vendors table), which syncFromNrs() and
// applyNrsInactivityFromWeb() populate from NRS — so this is NRS-sourced data
// without a live scrape per hover.
//
// TODO(nrs-live): when per-request NRS API access is sanctioned, swap/augment
// this with a live nrs-api-client call behind this same interface. Nothing
// outside this file should notice.

import { inArray } from 'drizzle-orm';
import { db, vendors } from '$lib/server/db';
import type { Connector, ConnectorResult } from './types';

export const nrsConnector: Connector = {
	type: 'nrs',
	joinAttribute: 'vendor_id',
	caps: { resolve: true, render: false },

	schema() {
		return [
			{ name: 'displayName', type: 'string' },
			{ name: 'monthlyRent', type: 'number' },
			{ name: 'status', type: 'string' },
			{ name: 'nrsInactive', type: 'boolean' }
		];
	},

	async resolve(keys: string[]): Promise<ConnectorResult> {
		const numeric = [...new Set(keys)].filter((k) => /^\d+$/.test(k)).map(Number);
		if (numeric.length === 0) return {};
		const rows = await db
			.select({
				nrsVendorId: vendors.nrsVendorId,
				displayName: vendors.displayName,
				monthlyRentCents: vendors.monthlyRentCents,
				status: vendors.status,
				nrsInactive: vendors.nrsInactive
			})
			.from(vendors)
			.where(inArray(vendors.nrsVendorId, numeric));

		const out: ConnectorResult = {};
		for (const row of rows) {
			out[String(row.nrsVendorId)] = {
				displayName: row.displayName,
				monthlyRent: row.monthlyRentCents !== null ? row.monthlyRentCents / 100 : null,
				status: row.status,
				nrsInactive: row.nrsInactive
			};
		}
		return out;
	}
};
