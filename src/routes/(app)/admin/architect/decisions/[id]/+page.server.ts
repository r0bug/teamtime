// Architecture Decision Detail Page Server
import type { PageServerLoad, Actions } from './$types';
import { db, architectureDecisions } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const [decision] = await db
		.select()
		.from(architectureDecisions)
		.where(eq(architectureDecisions.id, params.id));

	if (!decision) {
		throw error(404, 'Decision not found');
	}

	return {
		decision: {
			id: decision.id,
			title: decision.title,
			status: decision.status,
			category: decision.category,
			context: decision.context,
			decision: decision.decision,
			consequences: decision.consequences,
			claudeCodePrompt: decision.claudeCodePrompt,
			implementationPlan: decision.implementationPlan as {
				phases: { name: string; tasks: string[]; dependencies?: string[] }[];
			} | null,
			relatedFiles: decision.relatedFiles as string[] | null,
			implementedAt: decision.implementedAt?.toISOString(),
			createdAt: decision.createdAt.toISOString(),
			updatedAt: decision.updatedAt.toISOString()
		},
		statuses: ['proposed', 'approved', 'in_progress', 'implemented', 'rejected', 'superseded']
	};
};

export const actions: Actions = {
	updateStatus: async ({ params, request }) => {
		const formData = await request.formData();
		const status = formData.get('status') as string;

		const updates: Record<string, unknown> = {
			status,
			updatedAt: new Date()
		};

		if (status === 'implemented') {
			updates.implementedAt = new Date();
		}

		await db
			.update(architectureDecisions)
			.set(updates)
			.where(eq(architectureDecisions.id, params.id));

		return { success: true, message: `Status updated to ${status}` };
	},

	delete: async ({ params }) => {
		await db
			.delete(architectureDecisions)
			.where(eq(architectureDecisions.id, params.id));

		throw redirect(303, '/admin/architect/decisions');
	}
};
