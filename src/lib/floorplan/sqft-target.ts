// "What would it take to reach $X / sq ft?" — shown in the staff floorplan
// booth popover. Two independent levers, each holding the other at last
// month's level:
//
//   sales needed = (target × sq ft − rent) / store's share of gross
//   rent needed  =  target × sq ft − store's share of sales

export interface SqftTargetInput {
	sqft: number;
	rent: number;
	/** Store's retained share of sales ($). */
	storeShare: number;
	/** Store's share of gross sales (0–1), or null if unknown. */
	retainedRate: number | null;
}

export interface SqftTargetResult {
	/** Monthly store revenue the booth must produce to hit the target. */
	targetRevenue: number;
	/** How far short the booth is (0 when already at/above target). */
	gap: number;
	atTarget: boolean;
	/** Gross monthly sales needed at current rent; null when the store's share of sales is unknown or zero. */
	salesNeeded: number | null;
	/** Monthly rent needed at current sales. */
	rentNeeded: number;
}

export function sqftTarget(b: SqftTargetInput, targetPerSqft: number): SqftTargetResult | null {
	if (b.sqft <= 0 || !(targetPerSqft > 0)) return null;
	const targetRevenue = targetPerSqft * b.sqft;
	const gap = Math.max(0, targetRevenue - (b.storeShare + b.rent));
	const rate = b.retainedRate;
	return {
		targetRevenue,
		gap,
		atTarget: gap === 0,
		salesNeeded: rate && rate > 0 ? Math.max(0, (targetRevenue - b.rent) / rate) : null,
		rentNeeded: Math.max(0, targetRevenue - b.storeShare)
	};
}
