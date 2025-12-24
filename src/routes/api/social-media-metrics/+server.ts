import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, socialMediaSubmissions, socialMediaConfigs, socialMediaTaskLinks } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const submissions = await db.select()
		.from(socialMediaSubmissions)
		.orderBy(desc(socialMediaSubmissions.submittedAt))
		.limit(50);

	return json(submissions);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const body = await request.json();
	const { taskId, configId, postUrl, values, notes } = body;

	if (!taskId || !configId || !postUrl || !values) {
		return json({ error: 'taskId, configId, postUrl, and values are required' }, { status: 400 });
	}

	// Verify config exists
	const [config] = await db.select().from(socialMediaConfigs).where(eq(socialMediaConfigs.id, configId)).limit(1);
	if (!config) {
		return json({ error: 'Config not found' }, { status: 404 });
	}

	// Create submission
	const [submission] = await db.insert(socialMediaSubmissions).values({
		taskId,
		configId,
		userId: locals.user.id,
		postUrl,
		values,
		notes: notes || null
	}).returning();

	// Update task link with URL if not already set
	await db.update(socialMediaTaskLinks)
		.set({ postUrl })
		.where(eq(socialMediaTaskLinks.taskId, taskId));

	return json(submission, { status: 201 });
};
