// Architecture Decision Detail API - Get, update, delete specific ADR
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, architectureDecisions } from '$lib/server/db';
import { eq } from 'drizzle-orm';

// GET - Get a specific decision
export const GET: RequestHandler = async ({ params }) => {
	try {
		const [decision] = await db
			.select()
			.from(architectureDecisions)
			.where(eq(architectureDecisions.id, params.id));

		if (!decision) {
			return json({ success: false, error: 'Decision not found' }, { status: 404 });
		}

		return json({
			success: true,
			decision: {
				id: decision.id,
				title: decision.title,
				status: decision.status,
				category: decision.category,
				context: decision.context,
				decision: decision.decision,
				consequences: decision.consequences,
				claudeCodePrompt: decision.claudeCodePrompt,
				implementationPlan: decision.implementationPlan,
				relatedFiles: decision.relatedFiles,
				implementedAt: decision.implementedAt?.toISOString(),
				createdByAiRunId: decision.createdByAiRunId,
				createdByChatId: decision.createdByChatId,
				createdByUserId: decision.createdByUserId,
				createdAt: decision.createdAt.toISOString(),
				updatedAt: decision.updatedAt.toISOString()
			}
		});
	} catch (error) {
		console.error('[Architect Decision] Get error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// PATCH - Update decision status or content
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const updates: Partial<typeof architectureDecisions.$inferInsert> = {};

		// Handle status transitions
		if (body.status) {
			const validStatuses = ['proposed', 'approved', 'in_progress', 'implemented', 'rejected', 'superseded'];
			if (!validStatuses.includes(body.status)) {
				return json({
					success: false,
					error: `status must be one of: ${validStatuses.join(', ')}`
				}, { status: 400 });
			}
			updates.status = body.status;

			// Set implementedAt when status changes to implemented
			if (body.status === 'implemented') {
				updates.implementedAt = new Date();
			}
		}

		// Handle other updates
		if (body.title !== undefined) updates.title = body.title;
		if (body.context !== undefined) updates.context = body.context;
		if (body.decision !== undefined) updates.decision = body.decision;
		if (body.consequences !== undefined) updates.consequences = body.consequences;
		if (body.claudeCodePrompt !== undefined) updates.claudeCodePrompt = body.claudeCodePrompt;
		if (body.implementationPlan !== undefined) updates.implementationPlan = body.implementationPlan;
		if (body.relatedFiles !== undefined) updates.relatedFiles = body.relatedFiles;

		updates.updatedAt = new Date();

		const [updated] = await db
			.update(architectureDecisions)
			.set(updates)
			.where(eq(architectureDecisions.id, params.id))
			.returning();

		if (!updated) {
			return json({ success: false, error: 'Decision not found' }, { status: 404 });
		}

		return json({
			success: true,
			decision: {
				id: updated.id,
				title: updated.title,
				status: updated.status,
				category: updated.category,
				updatedAt: updated.updatedAt.toISOString()
			}
		});
	} catch (error) {
		console.error('[Architect Decision] Update error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// DELETE - Delete a decision
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const [deleted] = await db
			.delete(architectureDecisions)
			.where(eq(architectureDecisions.id, params.id))
			.returning({ id: architectureDecisions.id });

		if (!deleted) {
			return json({ success: false, error: 'Decision not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('[Architect Decision] Delete error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
