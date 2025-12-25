/**
 * @module Services/SalesAttribution
 * @description Distributes daily sales to staff based on hours worked.
 *
 * This service runs daily (typically via cron) to:
 * 1. Query the day's sales snapshot
 * 2. Calculate each staff member's hours worked
 * 3. Distribute retained sales proportionally by hours
 * 4. Award gamification points based on sales attribution
 * 5. Check for sales-related achievements
 *
 * Point Awards:
 * - Base: floor(attributedRetained / 100) * 5 points
 * - Top seller bonus: 50 points for highest sales
 * - Beat average bonus: 20 points for above-average performance
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for day boundaries.
 * All date calculations use getPacificDayBounds() to ensure correct attribution.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 * @see {@link ./points-service} for point calculation details
 * @see {@link ./achievements-service} for achievement checking
 */

import { db, timeEntries, salesSnapshots, userStats, users } from '$lib/server/db';
import { eq, and, gte, lt, sql, isNotNull } from 'drizzle-orm';
import { awardPoints, POINT_VALUES } from './points-service';
import { checkAndAwardAchievements } from './achievements-service';
import { getPacificDayBounds } from '$lib/server/utils/timezone';

interface StaffAttribution {
	userId: string;
	userName: string;
	hoursWorked: number;
	percentOfDay: number;
	attributedRetained: number;
	salesPerHour: number;
	pointsEarned: number;
}

interface DailySalesAttribution {
	date: string;
	totalRetained: number;
	totalStaffHours: number;
	staffAttributions: StaffAttribution[];
	topPerformer: string | null;
}

/**
 * Calculate and award sales points for a specific date
 */
export async function processDailySalesPoints(date: Date): Promise<DailySalesAttribution | null> {
	const dateStr = date.toISOString().split('T')[0];

	// Get sales snapshot for this date
	const [snapshot] = await db
		.select({
			id: salesSnapshots.id,
			totalRetained: salesSnapshots.totalRetained
		})
		.from(salesSnapshots)
		.where(eq(salesSnapshots.saleDate, dateStr))
		.limit(1);

	if (!snapshot || parseFloat(snapshot.totalRetained) === 0) {
		console.log(`No sales data for ${dateStr}`);
		return null;
	}

	const totalRetained = parseFloat(snapshot.totalRetained);

	// Get start and end of day in Pacific time
	const { start: dayStart, end: dayEnd } = getPacificDayBounds(date);

	// Get all time entries for this date (staff who worked)
	const entries = await db
		.select({
			userId: timeEntries.userId,
			userName: users.name,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut
		})
		.from(timeEntries)
		.leftJoin(users, eq(timeEntries.userId, users.id))
		.where(
			and(
				gte(timeEntries.clockIn, dayStart),
				lt(timeEntries.clockIn, dayEnd),
				isNotNull(timeEntries.clockOut) // Only completed shifts
			)
		);

	if (entries.length === 0) {
		console.log(`No staff worked on ${dateStr}`);
		return null;
	}

	// Calculate hours for each staff member
	const staffHours: Map<string, { name: string; hours: number }> = new Map();

	for (const entry of entries) {
		if (!entry.clockOut) continue;

		const clockIn = new Date(entry.clockIn);
		const clockOut = new Date(entry.clockOut);
		const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

		const existing = staffHours.get(entry.userId);
		if (existing) {
			existing.hours += hours;
		} else {
			staffHours.set(entry.userId, { name: entry.userName || 'Unknown', hours });
		}
	}

	// Calculate total staff hours
	let totalStaffHours = 0;
	for (const [, data] of staffHours) {
		totalStaffHours += data.hours;
	}

	if (totalStaffHours === 0) {
		console.log(`No valid hours worked on ${dateStr}`);
		return null;
	}

	// Calculate attributions
	const staffAttributions: StaffAttribution[] = [];
	let topPerformer: { userId: string; salesPerHour: number } | null = null;

	for (const [userId, data] of staffHours) {
		const percentOfDay = data.hours / totalStaffHours;
		const attributedRetained = totalRetained * percentOfDay;
		const salesPerHour = attributedRetained / data.hours;

		// Points: floor(attributedRetained / 100) * 5
		const pointsEarned = Math.floor(attributedRetained / 100) * POINT_VALUES.SALES_PER_100_RETAINED;

		staffAttributions.push({
			userId,
			userName: data.name,
			hoursWorked: Math.round(data.hours * 100) / 100,
			percentOfDay: Math.round(percentOfDay * 10000) / 100, // Percentage with 2 decimals
			attributedRetained: Math.round(attributedRetained * 100) / 100,
			salesPerHour: Math.round(salesPerHour * 100) / 100,
			pointsEarned
		});

		// Track top performer by sales per hour
		if (!topPerformer || salesPerHour > topPerformer.salesPerHour) {
			topPerformer = { userId, salesPerHour };
		}
	}

	// Award points to each staff member
	for (const attribution of staffAttributions) {
		if (attribution.pointsEarned > 0) {
			const isTopPerformer = topPerformer?.userId === attribution.userId;

			// Award base sales points
			await awardPoints({
				userId: attribution.userId,
				category: 'sales',
				action: 'daily_sales_attribution',
				basePoints: attribution.pointsEarned,
				description: `Sales attribution for ${dateStr}: $${attribution.attributedRetained.toFixed(2)} retained`,
				sourceType: 'sales_snapshot',
				sourceId: snapshot.id,
				metadata: {
					date: dateStr,
					hoursWorked: attribution.hoursWorked,
					attributedRetained: attribution.attributedRetained,
					salesPerHour: attribution.salesPerHour,
					percentOfDay: attribution.percentOfDay
				}
			});

			// Award top performer bonus
			if (isTopPerformer && staffAttributions.length > 1) {
				await awardPoints({
					userId: attribution.userId,
					category: 'sales',
					action: 'top_seller_of_day',
					basePoints: POINT_VALUES.SALES_TOP_SELLER,
					description: `Top seller bonus for ${dateStr}`,
					sourceType: 'sales_snapshot',
					sourceId: snapshot.id,
					metadata: {
						date: dateStr,
						salesPerHour: attribution.salesPerHour
					}
				});
			}

			// Update user stats
			await db
				.update(userStats)
				.set({
					salesPoints: sql`${userStats.salesPoints} + ${attribution.pointsEarned + (isTopPerformer && staffAttributions.length > 1 ? POINT_VALUES.SALES_TOP_SELLER : 0)}`,
					updatedAt: new Date()
				})
				.where(eq(userStats.userId, attribution.userId));

			// Check for achievements
			await checkAndAwardAchievements(attribution.userId);
		}
	}

	return {
		date: dateStr,
		totalRetained,
		totalStaffHours: Math.round(totalStaffHours * 100) / 100,
		staffAttributions,
		topPerformer: topPerformer?.userId || null
	};
}

/**
 * Process sales points for yesterday (to be called by daily cron)
 */
export async function processYesterdaySalesPoints(): Promise<DailySalesAttribution | null> {
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	yesterday.setHours(12, 0, 0, 0); // Noon to avoid timezone issues

	return processDailySalesPoints(yesterday);
}

/**
 * Check if sales points have already been processed for a date
 */
export async function hasSalesPointsBeenProcessed(date: string): Promise<boolean> {
	const [existing] = await db
		.select({ id: sql<string>`id` })
		.from(sql`point_transactions`)
		.where(
			and(
				eq(sql`action`, 'daily_sales_attribution'),
				sql`metadata->>'date' = ${date}`
			)
		)
		.limit(1);

	return !!existing;
}
