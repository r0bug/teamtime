/**
 * Client-safe holds helpers — labels and the pure urgency calculation.
 *
 * Keep this free of server-only imports so it can be used in Svelte components.
 * The server-side `urgencyAnchor` (which needs timezone utilities) lives in
 * `$lib/server/services/holds-service.ts` and re-exports these.
 */
export type HoldUrgency = 'normal' | 'red' | 'flash';

export const HOLD_REASON_LABELS: Record<string, string> = {
	awaiting_price: 'Awaiting price',
	awaiting_vendor_acceptance: 'Awaiting vendor acceptance of offer',
	customer_pickup: 'Customer pickup',
	other: 'Other'
};

export const HOLD_CLEARED_REASON_LABELS: Record<string, string> = {
	price_received: 'Price received',
	sold: 'Sold',
	returned_to_shelf: 'Returned to shelf',
	cancelled: 'Cancelled'
};

export const HOLD_REASONS = [
	'awaiting_price',
	'awaiting_vendor_acceptance',
	'customer_pickup',
	'other'
] as const;

export const HOLD_CLEARED_REASONS = [
	'price_received',
	'sold',
	'returned_to_shelf',
	'cancelled'
] as const;

/**
 * Map an urgency anchor (the instant the clock counts from) to a display state.
 * Red after 24h past the anchor, flashing red after 48h.
 */
export function holdUrgency(anchor: Date | string, now: Date = new Date()): HoldUrgency {
	const a = anchor instanceof Date ? anchor : new Date(anchor);
	const hoursPast = (now.getTime() - a.getTime()) / 3_600_000;
	if (hoursPast > 48) return 'flash';
	if (hoursPast > 24) return 'red';
	return 'normal';
}
