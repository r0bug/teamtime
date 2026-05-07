import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { getVendor } from '$lib/server/services/vendor-service';
import { getVendorSales } from '$lib/server/services/nrs-api-client';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const vendor = await getVendor(params.id);
	if (!vendor) throw error(404, 'Vendor not found');
	if (!vendor.nrsVendorId) {
		return json({ vendor, records: [], summary: emptySummary(), notLinked: true });
	}

	const startDate = url.searchParams.get('start');
	const endDate = url.searchParams.get('end');
	if (!startDate || !DATE_RE.test(startDate)) throw error(400, 'start (YYYY-MM-DD) is required');
	if (!endDate || !DATE_RE.test(endDate)) throw error(400, 'end (YYYY-MM-DD) is required');

	const records = await getVendorSales({
		nrsVendorId: vendor.nrsVendorId,
		startDate,
		endDate
	});

	return json({ vendor, records, summary: summarize(records) });
};

function emptySummary() {
	return { totalGross: 0, totalVendor: 0, totalRetained: 0, transactionCount: 0, avgTransaction: 0 };
}

function summarize(records: { totalPrice: number; vendorPortionOfTotalPrice: number; retainedAmountFromVendor: number }[]) {
	if (records.length === 0) return emptySummary();
	const totalGross = records.reduce((s, r) => s + (r.totalPrice ?? 0), 0);
	const totalVendor = records.reduce((s, r) => s + (r.vendorPortionOfTotalPrice ?? 0), 0);
	const totalRetained = records.reduce((s, r) => s + (r.retainedAmountFromVendor ?? 0), 0);
	return {
		totalGross: round2(totalGross),
		totalVendor: round2(totalVendor),
		totalRetained: round2(totalRetained),
		transactionCount: records.length,
		avgTransaction: round2(totalGross / records.length)
	};
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
