import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, tasks, users, pricingDecisions, pricingDecisionPhotos } from '$lib/server/db';
import { eq, and, isNull, desc } from 'drizzle-orm';

// GET /api/ebay-tasks - List eBay listing tasks (for eBay-capable users)
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check if user can list on eBay
	const [user] = await db
		.select({ canListOnEbay: users.canListOnEbay })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);

	if (!user?.canListOnEbay && locals.user.role !== 'admin' && locals.user.role !== 'manager') {
		return json({ error: 'You do not have permission to view eBay tasks' }, { status: 403 });
	}

	const showClaimed = url.searchParams.get('showClaimed') === 'true';
	const showCompleted = url.searchParams.get('showCompleted') === 'true';

	try {
		// Build conditions
		const conditions = [eq(tasks.source, 'ebay_listing')];

		if (!showClaimed) {
			// Only show unclaimed tasks (assignedTo is null)
			conditions.push(isNull(tasks.assignedTo));
		}

		if (!showCompleted) {
			// Exclude completed/cancelled tasks
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

		// For each task, get the associated pricing decision
		const tasksWithDecisions = await Promise.all(
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

				// Get first photo as thumbnail
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

		return json({ tasks: tasksWithDecisions });
	} catch (error) {
		console.error('Error fetching eBay tasks:', error);
		return json({ error: 'Failed to fetch eBay tasks' }, { status: 500 });
	}
};
