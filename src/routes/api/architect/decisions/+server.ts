// Architecture Decisions API - List and query ADRs
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, architectureDecisions } from '$lib/server/db';
import { desc, eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:architect:decisions');

// GET - List all architecture decisions
export const GET: RequestHandler = async ({ url }) => {
	try {
		const status = url.searchParams.get('status');
		const category = url.searchParams.get('category');
		const limit = parseInt(url.searchParams.get('limit') || '50', 10);

		let query = db.select().from(architectureDecisions);

		// Note: drizzle-orm query chaining is tricky, so we'll build conditions
		const conditions: Parameters<typeof eq>[] = [];

		const decisions = await db
			.select()
			.from(architectureDecisions)
			.orderBy(desc(architectureDecisions.createdAt))
			.limit(limit);

		// Filter in JS for simplicity (could be done in SQL with dynamic query building)
		let filtered = decisions;
		if (status) {
			filtered = filtered.filter(d => d.status === status);
		}
		if (category) {
			filtered = filtered.filter(d => d.category === category);
		}

		return json({
			success: true,
			decisions: filtered.map(d => ({
				id: d.id,
				title: d.title,
				status: d.status,
				category: d.category,
				context: d.context,
				decision: d.decision,
				consequences: d.consequences,
				relatedFiles: d.relatedFiles,
				implementedAt: d.implementedAt?.toISOString(),
				createdAt: d.createdAt.toISOString(),
				updatedAt: d.updatedAt.toISOString()
			}))
		});
	} catch (error) {
		log.error({ error }, 'List error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST - Create a new decision manually
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const { title, category, context, decision, consequences, relatedFiles } = body;

		if (!title || !category || !context || !decision) {
			return json({
				success: false,
				error: 'title, category, context, and decision are required'
			}, { status: 400 });
		}

		const validCategories = ['schema', 'api', 'ui', 'integration', 'security', 'architecture'];
		if (!validCategories.includes(category)) {
			return json({
				success: false,
				error: `category must be one of: ${validCategories.join(', ')}`
			}, { status: 400 });
		}

		const [newDecision] = await db
			.insert(architectureDecisions)
			.values({
				title,
				category,
				context,
				decision,
				consequences,
				relatedFiles,
				status: 'proposed',
				createdByUserId: locals.user?.id
			})
			.returning();

		return json({
			success: true,
			decision: {
				id: newDecision.id,
				title: newDecision.title,
				status: newDecision.status,
				category: newDecision.category,
				createdAt: newDecision.createdAt.toISOString()
			}
		});
	} catch (error) {
		log.error({ error, userId: locals.user?.id, title }, 'Create error');
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
