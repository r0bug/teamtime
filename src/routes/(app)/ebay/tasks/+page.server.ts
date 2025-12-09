import type { PageServerLoad } from './$types';
import { db, tasks, users, pricingDecisions, pricingDecisionPhotos } from '$lib/server/db';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;

	// Check if user can view eBay tasks
	const [userData] = await db
		.select({ canListOnEbay: users.canListOnEbay })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	const isManager = user.role === 'manager' || user.role === 'admin';
	const canViewEbayTasks = userData?.canListOnEbay || isManager;

	if (!canViewEbayTasks) {
		throw error(403, 'You do not have permission to view eBay tasks');
	}

	const showClaimed = url.searchParams.get('showClaimed') === 'true';
	const showCompleted = url.searchParams.get('showCompleted') === 'true';

	// Build conditions
	const conditions = [eq(tasks.source, 'ebay_listing')];

	if (!showClaimed) {
		conditions.push(isNull(tasks.assignedTo));
	}

	if (!showCompleted) {
		conditions.push(eq(tasks.status, 'not_started'));
	}

	const ebayTasks = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			description: tasks.description,
			status: tasks.status,
			assignedTo: tasks.assignedTo,
			assigneeName: users.name,
			priority: tasks.priority,
			createdAt: tasks.createdAt
		})
		.from(tasks)
		.leftJoin(users, eq(tasks.assignedTo, users.id))
		.where(and(...conditions))
		.orderBy(desc(tasks.createdAt));

	// Get pricing decision details for each task
	const tasksWithDetails = await Promise.all(
		ebayTasks.map(async (task) => {
			const [decision] = await db
				.select({
					id: pricingDecisions.id,
					itemDescription: pricingDecisions.itemDescription,
					price: pricingDecisions.price,
					ebayReason: pricingDecisions.ebayReason,
					pricedAt: pricingDecisions.pricedAt
				})
				.from(pricingDecisions)
				.where(eq(pricingDecisions.ebayTaskId, task.id))
				.limit(1);

			let thumbnail = null;
			if (decision) {
				const [photo] = await db
					.select({ filePath: pricingDecisionPhotos.filePath })
					.from(pricingDecisionPhotos)
					.where(eq(pricingDecisionPhotos.pricingDecisionId, decision.id))
					.limit(1);
				thumbnail = photo?.filePath || null;
			}

			return {
				...task,
				pricingDecision: decision || null,
				thumbnail
			};
		})
	);

	return {
		tasks: tasksWithDetails,
		canListOnEbay: userData?.canListOnEbay || false,
		isManager,
		showClaimed,
		showCompleted
	};
};
