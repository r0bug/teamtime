import type { PageServerLoad } from './$types';
import { db, inventoryDrops, inventoryDropPhotos, inventoryDropItems, users } from '$lib/server/db';
import { eq, desc, and, count, sql } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const userIsManager = isManager(user);

	// Non-managers only see their own drops
	const whereClause = userIsManager ? undefined : eq(inventoryDrops.userId, user.id);

	const drops = await db
		.select({
			id: inventoryDrops.id,
			userId: inventoryDrops.userId,
			userName: users.name,
			description: inventoryDrops.description,
			pickNotes: inventoryDrops.pickNotes,
			status: inventoryDrops.status,
			itemCount: inventoryDrops.itemCount,
			processingError: inventoryDrops.processingError,
			processedAt: inventoryDrops.processedAt,
			reviewedAt: inventoryDrops.reviewedAt,
			createdAt: inventoryDrops.createdAt,
			// Progress tracking fields
			photosTotal: inventoryDrops.photosTotal,
			photosUploaded: inventoryDrops.photosUploaded
		})
		.from(inventoryDrops)
		.leftJoin(users, eq(inventoryDrops.userId, users.id))
		.where(whereClause)
		.orderBy(desc(inventoryDrops.createdAt))
		.limit(50);

	// Get first photo and deleted item count for each drop
	const dropsWithDetails = await Promise.all(
		drops.map(async (drop) => {
			// Get thumbnail
			const [photo] = await db
				.select({ filePath: inventoryDropPhotos.filePath })
				.from(inventoryDropPhotos)
				.where(eq(inventoryDropPhotos.dropId, drop.id))
				.orderBy(inventoryDropPhotos.orderIndex)
				.limit(1);

			// Get deleted item count
			const [deletedCount] = await db
				.select({ count: count() })
				.from(inventoryDropItems)
				.where(
					and(
						eq(inventoryDropItems.dropId, drop.id),
						eq(inventoryDropItems.deleted, true)
					)
				);

			return {
				...drop,
				thumbnail: photo?.filePath || null,
				deletedItemCount: deletedCount?.count || 0
			};
		})
	);

	return {
		drops: dropsWithDetails,
		isManager: userIsManager
	};
};
