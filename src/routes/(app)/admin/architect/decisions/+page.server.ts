// Architecture Decisions List Page Server
import type { PageServerLoad } from './$types';
import { db, architectureDecisions } from '$lib/server/db';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status');
	const category = url.searchParams.get('category');

	// Get all decisions
	let decisions = await db
		.select()
		.from(architectureDecisions)
		.orderBy(desc(architectureDecisions.createdAt));

	// Apply filters
	if (status) {
		decisions = decisions.filter(d => d.status === status);
	}
	if (category) {
		decisions = decisions.filter(d => d.category === category);
	}

	// Calculate stats
	const stats = {
		total: decisions.length,
		proposed: decisions.filter(d => d.status === 'proposed').length,
		approved: decisions.filter(d => d.status === 'approved').length,
		inProgress: decisions.filter(d => d.status === 'in_progress').length,
		implemented: decisions.filter(d => d.status === 'implemented').length,
		rejected: decisions.filter(d => d.status === 'rejected').length
	};

	return {
		decisions: decisions.map(d => ({
			id: d.id,
			title: d.title,
			status: d.status,
			category: d.category,
			context: d.context.substring(0, 200) + (d.context.length > 200 ? '...' : ''),
			relatedFiles: d.relatedFiles as string[] | null,
			createdAt: d.createdAt.toISOString(),
			implementedAt: d.implementedAt?.toISOString()
		})),
		stats,
		filters: {
			status,
			category
		},
		statuses: ['proposed', 'approved', 'in_progress', 'implemented', 'rejected', 'superseded'],
		categories: ['schema', 'api', 'ui', 'integration', 'security', 'architecture']
	};
};
