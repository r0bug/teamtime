import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, pricingDecisions, pricingGrades, userStats } from '$lib/server/db';
import { eq, sql, inArray } from 'drizzle-orm';
import { awardPoints, POINT_VALUES } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
		throw error(403, 'Not authorized');
	}

	const body = await request.json();
	const { decisionIds, priceAccuracy, justificationQuality, photoQuality, feedback } = body;

	// Validate
	if (!Array.isArray(decisionIds) || decisionIds.length === 0) {
		throw error(400, 'decisionIds must be a non-empty array');
	}
	if (decisionIds.length > 50) {
		throw error(400, 'Maximum 50 decisions at a time');
	}
	for (const grade of [priceAccuracy, justificationQuality, photoQuality]) {
		if (typeof grade !== 'number' || grade < 1 || grade > 5 || !Number.isInteger(grade)) {
			throw error(400, 'All grades must be integers between 1 and 5');
		}
	}

	const overallGrade = (priceAccuracy * 0.4 + justificationQuality * 0.3 + photoQuality * 0.3).toFixed(2);
	const overallNum = parseFloat(overallGrade);

	let pointsAwarded = 0;
	if (overallNum >= 4.5) {
		pointsAwarded = POINT_VALUES.PRICING_GRADE_EXCELLENT;
	} else if (overallNum >= 3.5) {
		pointsAwarded = POINT_VALUES.PRICING_GRADE_GOOD;
	} else if (overallNum >= 2.5) {
		pointsAwarded = POINT_VALUES.PRICING_GRADE_ACCEPTABLE;
	} else {
		pointsAwarded = POINT_VALUES.PRICING_GRADE_POOR;
	}

	// Get decisions with their user IDs
	const decisions = await db
		.select({
			id: pricingDecisions.id,
			userId: pricingDecisions.userId
		})
		.from(pricingDecisions)
		.where(inArray(pricingDecisions.id, decisionIds));

	// Get already-graded decision IDs
	const existingGrades = await db
		.select({ pricingDecisionId: pricingGrades.pricingDecisionId })
		.from(pricingGrades)
		.where(inArray(pricingGrades.pricingDecisionId, decisionIds));

	const alreadyGraded = new Set(existingGrades.map((g) => g.pricingDecisionId));
	const feedbackText = feedback?.trim() || null;

	let graded = 0;
	let skipped = 0;

	for (const decision of decisions) {
		if (alreadyGraded.has(decision.id)) {
			skipped++;
			continue;
		}

		// Insert grade
		await db.insert(pricingGrades).values({
			pricingDecisionId: decision.id,
			gradedBy: locals.user.id,
			priceAccuracy,
			justificationQuality,
			photoQuality,
			overallGrade,
			feedback: feedbackText,
			pointsAwarded
		});

		// Award points
		if (pointsAwarded !== 0) {
			await awardPoints({
				userId: decision.userId,
				category: 'pricing',
				action: 'pricing_graded',
				basePoints: pointsAwarded,
				description: `Pricing grade: ${overallGrade}/5.0`,
				sourceType: 'pricing_decision',
				sourceId: decision.id,
				metadata: {
					priceAccuracy,
					justificationQuality,
					photoQuality,
					overallGrade: overallNum,
					bulkGraded: true
				}
			});

			// Update user stats
			await db
				.update(userStats)
				.set({
					pricingDecisions: sql`${userStats.pricingDecisions} + 1`,
					pricingPoints: sql`${userStats.pricingPoints} + ${pointsAwarded}`,
					avgPricingGrade: sql`CASE
						WHEN ${userStats.pricingDecisions} = 0 THEN ${overallGrade}
						ELSE ((${userStats.avgPricingGrade} * ${userStats.pricingDecisions}) + ${overallGrade}) / (${userStats.pricingDecisions} + 1)
					END`,
					updatedAt: new Date()
				})
				.where(eq(userStats.userId, decision.userId));

			// Check achievements
			await checkAndAwardAchievements(decision.userId);
		}

		graded++;
	}

	return json({ success: true, graded, skipped });
};
