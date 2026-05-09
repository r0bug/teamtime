import type { PageServerLoad } from './$types';
import { and, eq, desc } from 'drizzle-orm';
import {
	db,
	vendorTagSettings,
	pendingInventoryChanges,
	labelFormats
} from '$lib/server/db';

export const load: PageServerLoad = async ({ parent }) => {
	const { vendor } = await parent();

	const [settings] = await db
		.select()
		.from(vendorTagSettings)
		.where(eq(vendorTagSettings.vendorId, vendor.id))
		.limit(1);

	const sheetFormats = await db
		.select()
		.from(labelFormats)
		.where(and(eq(labelFormats.isActive, true), eq(labelFormats.layout, 'sheet')));

	const recent = await db
		.select({
			id: pendingInventoryChanges.id,
			partNumber: pendingInventoryChanges.partNumber,
			payload: pendingInventoryChanges.payload,
			status: pendingInventoryChanges.status,
			submittedAt: pendingInventoryChanges.submittedAt
		})
		.from(pendingInventoryChanges)
		.where(and(
			eq(pendingInventoryChanges.vendorId, vendor.id),
			eq(pendingInventoryChanges.changeType, 'create')
		))
		.orderBy(desc(pendingInventoryChanges.submittedAt))
		.limit(100);

	const items = recent.map((r) => {
		const p = (r.payload ?? {}) as { partName?: string; description?: string; priceCents?: number };
		return {
			partNumber: r.partNumber,
			name: p.partName ?? null,
			description: p.description ?? null,
			priceCents: p.priceCents ?? null,
			status: r.status,
			submittedAt: r.submittedAt
		};
	});

	return {
		settings: settings ?? null,
		sheetFormats,
		items,
		preferredFormatCode: settings?.preferredFormat ?? 'avery_5160'
	};
};
