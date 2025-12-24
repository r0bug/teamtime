import type { PageServerLoad, Actions } from './$types';
import { db, pricingDecisions, pricingGrades, pricingDecisionPhotos, users, userStats } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { error, redirect, fail } from '@sveltejs/kit';
import { awardPoints, POINT_VALUES } from '$lib/server/services/points-service';
import { checkAndAwardAchievements } from '$lib/server/services/achievements-service';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
		throw redirect(302, '/dashboard');
	}

	const { id } = params;

	// Get the pricing decision with user info
	const [decision] = await db
		.select({
			id: pricingDecisions.id,
			userId: pricingDecisions.userId,
			userName: users.name,
			itemDescription: pricingDecisions.itemDescription,
			price: pricingDecisions.price,
			priceJustification: pricingDecisions.priceJustification,
			destination: pricingDecisions.destination,
			ebayReason: pricingDecisions.ebayReason,
			address: pricingDecisions.address,
			pricedAt: pricingDecisions.pricedAt
		})
		.from(pricingDecisions)
		.leftJoin(users, eq(pricingDecisions.userId, users.id))
		.where(eq(pricingDecisions.id, id));

	if (!decision) {
		throw error(404, 'Pricing decision not found');
	}

	// Get photos
	const photos = await db
		.select({
			id: pricingDecisionPhotos.id,
			filePath: pricingDecisionPhotos.filePath,
			originalName: pricingDecisionPhotos.originalName
		})
		.from(pricingDecisionPhotos)
		.where(eq(pricingDecisionPhotos.pricingDecisionId, id));

	// Get existing grade if any
	const [existingGrade] = await db
		.select()
		.from(pricingGrades)
		.where(eq(pricingGrades.pricingDecisionId, id));

	// Get grader name if graded
	let graderName = null;
	if (existingGrade) {
		const [grader] = await db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, existingGrade.gradedBy));
		graderName = grader?.name;
	}

	return {
		decision,
		photos,
		existingGrade: existingGrade
			? {
					...existingGrade,
					graderName
				}
			: null
	};
};

export const actions: Actions = {
	grade: async ({ request, locals, params }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
			throw error(403, 'Not authorized');
		}

		const { id } = params;
		const formData = await request.formData();

		const priceAccuracy = parseInt(formData.get('priceAccuracy') as string);
		const justificationQuality = parseInt(formData.get('justificationQuality') as string);
		const photoQuality = parseInt(formData.get('photoQuality') as string);
		const feedback = (formData.get('feedback') as string)?.trim() || null;

		// Validate grades (1-5)
		for (const [name, value] of [
			['priceAccuracy', priceAccuracy],
			['justificationQuality', justificationQuality],
			['photoQuality', photoQuality]
		]) {
			if (isNaN(value as number) || (value as number) < 1 || (value as number) > 5) {
				return fail(400, { error: `${name} must be between 1 and 5` });
			}
		}

		// Calculate overall grade (weighted average)
		const overallGrade = (priceAccuracy * 0.4 + justificationQuality * 0.3 + photoQuality * 0.3).toFixed(2);

		// Determine points based on grade
		let pointsAwarded = 0;
		const overallNum = parseFloat(overallGrade);
		if (overallNum >= 4.5) {
			pointsAwarded = POINT_VALUES.PRICING_GRADE_EXCELLENT;
		} else if (overallNum >= 3.5) {
			pointsAwarded = POINT_VALUES.PRICING_GRADE_GOOD;
		} else if (overallNum >= 2.5) {
			pointsAwarded = POINT_VALUES.PRICING_GRADE_ACCEPTABLE;
		} else {
			pointsAwarded = POINT_VALUES.PRICING_GRADE_POOR; // Negative
		}

		// Get the pricing decision to find the user
		const [decision] = await db
			.select({ userId: pricingDecisions.userId })
			.from(pricingDecisions)
			.where(eq(pricingDecisions.id, id));

		if (!decision) {
			return fail(404, { error: 'Pricing decision not found' });
		}

		// Check if already graded
		const [existing] = await db
			.select({ id: pricingGrades.id })
			.from(pricingGrades)
			.where(eq(pricingGrades.pricingDecisionId, id));

		if (existing) {
			return fail(400, { error: 'This pricing decision has already been graded' });
		}

		// Insert grade
		const [grade] = await db
			.insert(pricingGrades)
			.values({
				pricingDecisionId: id,
				gradedBy: locals.user.id,
				priceAccuracy,
				justificationQuality,
				photoQuality,
				overallGrade,
				feedback,
				pointsAwarded
			})
			.returning();

		// Award points to the user
		if (pointsAwarded !== 0) {
			await awardPoints({
				userId: decision.userId,
				category: 'pricing',
				action: 'pricing_graded',
				basePoints: pointsAwarded,
				description: `Pricing grade: ${overallGrade}/5.0`,
				sourceType: 'pricing_decision',
				sourceId: id,
				metadata: {
					priceAccuracy,
					justificationQuality,
					photoQuality,
					overallGrade: overallNum
				}
			});

			// Update user stats - increment pricing decisions count and update average
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

			// Check for achievements
			await checkAndAwardAchievements(decision.userId);
		}

		throw redirect(302, '/admin/pricing/grading');
	}
};
