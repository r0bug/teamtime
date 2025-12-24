import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, socialMediaConfigs } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { eq } from 'drizzle-orm';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user || !isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const body = await request.json();
	const { name, platform, fields, requireUrl, requireScreenshot, isActive } = body;

	const [updated] = await db.update(socialMediaConfigs)
		.set({
			...(name && { name }),
			...(platform && { platform }),
			...(fields && { fields }),
			...(requireUrl !== undefined && { requireUrl }),
			...(requireScreenshot !== undefined && { requireScreenshot }),
			...(isActive !== undefined && { isActive }),
			updatedAt: new Date()
		})
		.where(eq(socialMediaConfigs.id, params.id))
		.returning();

	if (!updated) {
		return json({ error: 'Config not found' }, { status: 404 });
	}

	return json(updated);
};
