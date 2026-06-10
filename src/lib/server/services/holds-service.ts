/**
 * Customer holds service — server-side urgency anchor calculation.
 *
 * The pure urgency logic, labels, and reason constants live in the client-safe
 * `$lib/holds` module and are re-exported here for server callers. This file
 * adds `urgencyAnchor`, which needs the server-only timezone utilities.
 */
import { parsePacificEndOfDay, toPacificDateString } from '$lib/server/utils/timezone';

export {
	HOLD_REASON_LABELS,
	HOLD_CLEARED_REASON_LABELS,
	HOLD_REASONS,
	HOLD_CLEARED_REASONS,
	holdUrgency
} from '$lib/holds';
export type { HoldUrgency } from '$lib/holds';

/**
 * The instant the 24h/48h urgency clock counts from. Customer-pickup holds
 * count toward (and past) the end of the promised pickup day; every other hold
 * counts from when it was created. Returns an absolute Date so the client only
 * has to compare against `now`.
 */
export function urgencyAnchor(hold: {
	reason: string;
	pickupDate: string | Date | null;
	createdAt: string | Date;
}): Date {
	if (hold.reason === 'customer_pickup' && hold.pickupDate) {
		const dateStr =
			typeof hold.pickupDate === 'string' ? hold.pickupDate : toPacificDateString(hold.pickupDate);
		return parsePacificEndOfDay(dateStr);
	}
	return hold.createdAt instanceof Date ? hold.createdAt : new Date(hold.createdAt);
}
