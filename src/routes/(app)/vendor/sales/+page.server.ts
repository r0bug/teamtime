import type { PageServerLoad } from './$types';
import { getVendorSales } from '$lib/server/services/nrs-api-client';

export const load: PageServerLoad = async ({ parent }) => {
	const { vendor } = await parent();

	if (!vendor.nrsVendorId) {
		return { records: [], summary: emptySummary(), notLinked: true };
	}

	const today = new Date();
	const end = today.toISOString().slice(0, 10);
	const start = new Date(today);
	start.setUTCDate(start.getUTCDate() - 29);
	const startStr = start.toISOString().slice(0, 10);

	const records = await getVendorSales({
		nrsVendorId: vendor.nrsVendorId,
		startDate: startStr,
		endDate: end
	});

	return { records, summary: summarize(records), notLinked: false, range: { start: startStr, end } };
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
