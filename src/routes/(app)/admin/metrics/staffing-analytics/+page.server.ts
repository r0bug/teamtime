import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	getTopWorkerPairs,
	getWorkerEfficiency,
	getWorkerImpact,
	getStaffingOptimization,
	getDayOfWeekAnalysis,
	generateStaffingInsights,
	computeAllStaffingAnalytics
} from '$lib/server/services/staffing-analytics-service';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get date range from query params (default 30 days)
	const endDateParam = url.searchParams.get('end');
	const startDateParam = url.searchParams.get('start');

	let startDate: Date;
	let endDate: Date;

	if (startDateParam && endDateParam) {
		startDate = new Date(startDateParam + 'T00:00:00');
		endDate = new Date(endDateParam + 'T23:59:59');
	} else {
		endDate = new Date();
		endDate.setHours(23, 59, 59, 999);
		startDate = new Date();
		startDate.setDate(startDate.getDate() - 30);
		startDate.setHours(0, 0, 0, 0);
	}

	const periodStart = startDate.toISOString().split('T')[0];
	const periodEnd = endDate.toISOString().split('T')[0];

	// Check if recompute requested
	const recompute = url.searchParams.get('recompute') === 'true';
	if (recompute) {
		await computeAllStaffingAnalytics(startDate, endDate);
	}

	// Load all data in parallel
	const [pairs, efficiency, impact, staffingLevels, dayOfWeek, insights] = await Promise.all([
		getTopWorkerPairs({ periodStart, periodEnd, limit: 10 }),
		getWorkerEfficiency({ periodStart, periodEnd, limit: 10 }),
		getWorkerImpact({ periodStart, periodEnd, limit: 10 }),
		getStaffingOptimization({ periodStart, periodEnd }),
		getDayOfWeekAnalysis({ periodStart, periodEnd }),
		generateStaffingInsights({ periodStart, periodEnd })
	]);

	return {
		startDate: periodStart,
		endDate: periodEnd,
		pairs,
		efficiency,
		impact,
		staffingLevels,
		dayOfWeek,
		insights,
		recomputed: recompute
	};
};
