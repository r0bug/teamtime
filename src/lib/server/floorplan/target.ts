import { eq } from 'drizzle-orm';
import { db, appSettings } from '$lib/server/db';

/**
 * Store revenue per sq ft goal, set in Admin → Settings → Floorplan. The staff
 * floorplan booth popover shows the sales or rent needed to reach it. Stored
 * in `appSettings` under this key as a plain dollar amount.
 */
export const TARGET_PER_SQFT_KEY = 'floorplan_target_per_sqft';
export const DEFAULT_TARGET_PER_SQFT = 3;

export function parseTargetPerSqft(raw: string | null | undefined): number {
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET_PER_SQFT;
}

export async function loadTargetPerSqft(): Promise<number> {
	const [row] = await db.select().from(appSettings).where(eq(appSettings.key, TARGET_PER_SQFT_KEY)).limit(1);
	return parseTargetPerSqft(row?.value);
}
