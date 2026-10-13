import { describe, it, expect } from 'vitest';
import { sqftTarget } from '$lib/floorplan/sqft-target';

describe('sqftTarget', () => {
	it('computes the sales or rent needed to hit the target', () => {
		// 100 sq ft at $3 → $300/mo. Store has $100 rent + $65 retained (13% of $500).
		const t = sqftTarget({ sqft: 100, rent: 100, storeShare: 65, retainedRate: 0.13 }, 3)!;
		expect(t.targetRevenue).toBe(300);
		expect(t.gap).toBe(135);
		expect(t.atTarget).toBe(false);
		expect(t.salesNeeded).toBeCloseTo(200 / 0.13, 2); // ≈ $1,538/mo gross
		expect(t.rentNeeded).toBe(235);
	});
	it('reports at-target and handles unknown share / no cells', () => {
		expect(sqftTarget({ sqft: 10, rent: 50, storeShare: 0, retainedRate: null }, 3)!.atTarget).toBe(true);
		expect(sqftTarget({ sqft: 100, rent: 0, storeShare: 0, retainedRate: null }, 3)!.salesNeeded).toBeNull();
		expect(sqftTarget({ sqft: 0, rent: 0, storeShare: 0, retainedRate: 0.13 }, 3)).toBeNull();
	});
});
