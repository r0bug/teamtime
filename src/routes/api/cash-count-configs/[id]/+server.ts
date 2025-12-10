import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, cashCountConfigs } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

// GET - Get a single cash count config
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const [config] = await db
			.select()
			.from(cashCountConfigs)
			.where(eq(cashCountConfigs.id, params.id))
			.limit(1);

		if (!config) {
			return json({ error: 'Config not found' }, { status: 404 });
		}

		return json({ success: true, config });
	} catch (error) {
		console.error('Error fetching cash count config:', error);
		return json({ error: 'Failed to fetch config' }, { status: 500 });
	}
};

// PATCH - Update a cash count config
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { name, fields, triggerType, isActive } = body;

		// Build update object with only provided fields
		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (name !== undefined) updates.name = name.trim();
		if (fields !== undefined) updates.fields = fields;
		if (triggerType !== undefined) updates.triggerType = triggerType;
		if (isActive !== undefined) updates.isActive = isActive;

		const [config] = await db
			.update(cashCountConfigs)
			.set(updates)
			.where(eq(cashCountConfigs.id, params.id))
			.returning();

		if (!config) {
			return json({ error: 'Config not found' }, { status: 404 });
		}

		return json({ success: true, config });
	} catch (error) {
		console.error('Error updating cash count config:', error);
		return json({ error: 'Failed to update config' }, { status: 500 });
	}
};

// DELETE - Delete a cash count config
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const [deleted] = await db
			.delete(cashCountConfigs)
			.where(eq(cashCountConfigs.id, params.id))
			.returning();

		if (!deleted) {
			return json({ error: 'Config not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting cash count config:', error);
		return json({ error: 'Failed to delete config' }, { status: 500 });
	}
};
