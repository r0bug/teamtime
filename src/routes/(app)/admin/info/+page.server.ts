import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { db, infoPosts, users } from '$lib/server/db';
import { eq, desc } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:info');

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	const posts = await db
		.select({
			id: infoPosts.id,
			title: infoPosts.title,
			content: infoPosts.content,
			category: infoPosts.category,
			isPinned: infoPosts.isPinned,
			isActive: infoPosts.isActive,
			createdBy: infoPosts.createdBy,
			createdAt: infoPosts.createdAt,
			updatedAt: infoPosts.updatedAt,
			authorName: users.name
		})
		.from(infoPosts)
		.leftJoin(users, eq(infoPosts.createdBy, users.id))
		.orderBy(desc(infoPosts.isPinned), desc(infoPosts.createdAt));

	return {
		posts
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const title = formData.get('title') as string;
		const content = formData.get('content') as string;
		const category = formData.get('category') as string;
		const isPinned = formData.get('isPinned') === 'true';

		if (!title || !content) {
			return fail(400, { error: 'Title and content are required' });
		}

		try {
			await db.insert(infoPosts).values({
				title,
				content,
				category: category || 'general',
				isPinned,
				createdBy: locals.user!.id
			});

			return { success: true, message: 'Post created successfully' };
		} catch (error) {
			log.error({ error, title, category }, 'Error creating post');
			return fail(500, { error: 'Failed to create post' });
		}
	},

	update: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const postId = formData.get('postId') as string;
		const title = formData.get('title') as string;
		const content = formData.get('content') as string;
		const category = formData.get('category') as string;
		const isPinned = formData.get('isPinned') === 'true';
		const isActive = formData.get('isActive') === 'true';

		if (!postId || !title || !content) {
			return fail(400, { error: 'Post ID, title, and content are required' });
		}

		try {
			await db
				.update(infoPosts)
				.set({
					title,
					content,
					category: category || 'general',
					isPinned,
					isActive,
					updatedAt: new Date()
				})
				.where(eq(infoPosts.id, postId));

			return { success: true, message: 'Post updated successfully' };
		} catch (error) {
			log.error({ error, postId, title }, 'Error updating post');
			return fail(500, { error: 'Failed to update post' });
		}
	},

	delete: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const postId = formData.get('postId') as string;

		if (!postId) {
			return fail(400, { error: 'Post ID required' });
		}

		try {
			await db.delete(infoPosts).where(eq(infoPosts.id, postId));
			return { success: true, message: 'Post deleted successfully' };
		} catch (error) {
			log.error({ error, postId }, 'Error deleting post');
			return fail(500, { error: 'Failed to delete post' });
		}
	},

	togglePin: async ({ request, locals }) => {
		if (!isManager(locals.user)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const postId = formData.get('postId') as string;
		const isPinned = formData.get('isPinned') === 'true';

		if (!postId) {
			return fail(400, { error: 'Post ID required' });
		}

		try {
			await db
				.update(infoPosts)
				.set({
					isPinned,
					updatedAt: new Date()
				})
				.where(eq(infoPosts.id, postId));

			return { success: true, message: isPinned ? 'Post pinned' : 'Post unpinned' };
		} catch (error) {
			log.error({ error, postId, isPinned }, 'Error toggling pin');
			return fail(500, { error: 'Failed to toggle pin' });
		}
	}
};
