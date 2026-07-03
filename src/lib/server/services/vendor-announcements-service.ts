/**
 * Vendor announcements ("news") — the staff→vendor communication channel in
 * the portal. Pinned announcements render as a sticky banner on every portal
 * page; everything active shows on /vendor/news. Archive (active=false)
 * instead of deleting so past notices stay auditable.
 */
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db, vendorAnnouncements } from '$lib/server/db';
import type { VendorAnnouncement } from '$lib/server/db';

function visibleNow() {
	const now = new Date();
	return and(
		eq(vendorAnnouncements.active, true),
		lte(vendorAnnouncements.publishedAt, now),
		or(isNull(vendorAnnouncements.expiresAt), gt(vendorAnnouncements.expiresAt, now))
	);
}

/** Everything a vendor should currently see, pinned first, newest first. */
export function listActiveAnnouncements(): Promise<VendorAnnouncement[]> {
	return db
		.select()
		.from(vendorAnnouncements)
		.where(visibleNow())
		.orderBy(desc(vendorAnnouncements.pinned), desc(vendorAnnouncements.publishedAt));
}

/** Just the pinned ones, for the portal-wide sticky banner (kept light). */
export function listPinnedAnnouncements(): Promise<
	Pick<VendorAnnouncement, 'id' | 'title' | 'updatedAt'>[]
> {
	return db
		.select({
			id: vendorAnnouncements.id,
			title: vendorAnnouncements.title,
			updatedAt: vendorAnnouncements.updatedAt
		})
		.from(vendorAnnouncements)
		.where(and(visibleNow(), eq(vendorAnnouncements.pinned, true)))
		.orderBy(desc(vendorAnnouncements.publishedAt));
}

/** Admin view: everything, including archived and future-dated. */
export function listAllAnnouncements(): Promise<VendorAnnouncement[]> {
	return db
		.select()
		.from(vendorAnnouncements)
		.orderBy(desc(vendorAnnouncements.publishedAt));
}

export interface SaveAnnouncementInput {
	id?: string | null;
	title: string;
	body: string;
	pinned: boolean;
	expiresAt?: Date | null;
}

/** Create (no id) or update (id) an announcement. */
export async function saveAnnouncement(
	input: SaveAnnouncementInput,
	actorId: string
): Promise<VendorAnnouncement> {
	if (input.id) {
		const [row] = await db
			.update(vendorAnnouncements)
			.set({
				title: input.title,
				body: input.body,
				pinned: input.pinned,
				expiresAt: input.expiresAt ?? null,
				updatedAt: new Date()
			})
			.where(eq(vendorAnnouncements.id, input.id))
			.returning();
		return row;
	}
	const [row] = await db
		.insert(vendorAnnouncements)
		.values({
			title: input.title,
			body: input.body,
			pinned: input.pinned,
			expiresAt: input.expiresAt ?? null,
			createdBy: actorId
		})
		.returning();
	return row;
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<void> {
	await db
		.update(vendorAnnouncements)
		.set({ active, updatedAt: new Date() })
		.where(eq(vendorAnnouncements.id, id));
}

export async function setAnnouncementPinned(id: string, pinned: boolean): Promise<void> {
	await db
		.update(vendorAnnouncements)
		.set({ pinned, updatedAt: new Date() })
		.where(eq(vendorAnnouncements.id, id));
}
