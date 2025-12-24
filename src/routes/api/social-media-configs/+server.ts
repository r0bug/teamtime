import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, socialMediaConfigs } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const configs = await db.select().from(socialMediaConfigs).orderBy(desc(socialMediaConfigs.createdAt));
	return json(configs);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const body = await request.json();
	const { name, platform, fields, requireUrl, requireScreenshot } = body;

	if (!name || !platform || !fields) {
		return json({ error: 'Name, platform, and fields are required' }, { status: 400 });
	}

	const [config] = await db.insert(socialMediaConfigs).values({
		name,
		platform,
		fields,
		requireUrl: requireUrl ?? true,
		requireScreenshot: requireScreenshot ?? false,
		createdBy: locals.user.id
	}).returning();

	return json(config, { status: 201 });
};
