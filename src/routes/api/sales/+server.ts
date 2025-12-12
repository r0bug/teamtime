// Sales API - Query sales snapshots
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, salesSnapshots } from '$lib/server/db';
import { eq, desc, gte, lte, and } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:sales');

// GET - Query sales snapshots
export const GET: RequestHandler = async ({ locals, url }) => {
	// Require authenticated user
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const date = url.searchParams.get('date'); // Single date YYYY-MM-DD
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		const latest = url.searchParams.get('latest') === 'true'; // Get latest snapshot only
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 100);

		let query = db.select().from(salesSnapshots);

		// Build conditions
		const conditions = [];

		if (date) {
			conditions.push(eq(salesSnapshots.saleDate, date));
		} else {
			if (startDate) {
				conditions.push(gte(salesSnapshots.saleDate, startDate));
			}
			if (endDate) {
				conditions.push(lte(salesSnapshots.saleDate, endDate));
			}
		}

		if (conditions.length > 0) {
			query = query.where(and(...conditions)) as typeof query;
		}

		// Order and limit
		query = query.orderBy(desc(salesSnapshots.capturedAt)).limit(latest ? 1 : limit) as typeof query;

		const snapshots = await query;

		// Format response
		const formatted = snapshots.map(s => ({
			id: s.id,
			saleDate: s.saleDate,
			capturedAt: s.capturedAt,
			totalSales: parseFloat(s.totalSales),
			totalVendorAmount: parseFloat(s.totalVendorAmount),
			totalRetained: parseFloat(s.totalRetained),
			vendorCount: s.vendorCount,
			vendors: s.vendors,
			source: s.source
		}));

		return json({
			success: true,
			count: formatted.length,
			snapshots: formatted
		});
	} catch (error) {
		log.error({ error }, 'Sales query error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
