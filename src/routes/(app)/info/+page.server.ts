import type { PageServerLoad } from './$types';
import { db, infoPosts, users } from '$lib/server/db';
import { eq, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	// All authenticated users can view active info posts
	// No role restriction - this is accessible to everyone

	// Get all ACTIVE info posts, ordered by pinned status then date
	const posts = await db
		.select({
			id: infoPosts.id,
			title: infoPosts.title,
			content: infoPosts.content,
			category: infoPosts.category,
			isPinned: infoPosts.isPinned,
			createdAt: infoPosts.createdAt,
			updatedAt: infoPosts.updatedAt,
			authorName: users.name
		})
		.from(infoPosts)
		.leftJoin(users, eq(infoPosts.createdBy, users.id))
		.where(eq(infoPosts.isActive, true)) // Only show active posts to regular users
		.orderBy(desc(infoPosts.isPinned), desc(infoPosts.createdAt));

	return {
		posts
	};
};
