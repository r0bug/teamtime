import { describe, it, expect } from 'vitest';
import {
	DEFAULT_SCALE,
	normalizeScale,
	commissionAt,
	rentAt,
	scaleSteps,
	evaluate,
	rentPerSqftForTarget,
	salesForTarget,
	breakEvenSales,
	rentIncreaseForTarget,
	normalizeCosts,
	totalCosts,
	breakEvenPerSqft,
	baselineSales,
	applyGrowth,
	totals
} from '$lib/revenue-calc/model';

const scale = { mode: 'linear' as const, rentLow: 0, commLow: 40, rentHigh: 4, commHigh: 10, minComm: 0 };
const step = { mode: 'step' as const, rentLow: 0, commLow: 13, rentHigh: 30, commHigh: 3, minComm: 3 };

describe('scale', () => {
	it('interpolates commission linearly and clamps outside the anchors', () => {
		expect(commissionAt(scale, 0)).toBe(40);
		expect(commissionAt(scale, 2)).toBe(25);
		expect(commissionAt(scale, 4)).toBe(10);
		expect(commissionAt(scale, 9)).toBe(10);
		expect(commissionAt(scale, -1)).toBe(40);
	});
	it('inverts back to rent', () => {
		expect(rentAt(scale, 25)).toBe(2);
		expect(rentAt(scale, 40)).toBe(0);
		expect(rentAt(scale, 10)).toBe(4);
	});
	it('normalizes bad input, swaps reversed anchors and enforces the floor', () => {
		expect(normalizeScale(null)).toEqual(DEFAULT_SCALE);
		expect(normalizeScale({ rentLow: 5, rentHigh: 1, commLow: 'x' as unknown as number })).toMatchObject({ rentLow: 1, rentHigh: 5, commLow: 13, mode: 'step' });
		expect(normalizeScale({ commHigh: 1, minComm: 3 }).commHigh).toBe(3);
	});
	it('step mode keeps the vendor rate until the premium threshold, then the floor', () => {
		expect(commissionAt(step, 0, 13)).toBe(13);
		expect(commissionAt(step, 12, 25)).toBe(25); // consignor on 75/25 stays there
		expect(commissionAt(step, 29.99, 13)).toBe(13);
		expect(commissionAt(step, 400 / 12, 13)).toBe(3); // $400/mo cabinet, 12 sq ft
		expect(commissionAt(step, 5, null)).toBe(13); // unknown rate → scale default
		expect(commissionAt(step, 0, 1)).toBe(3); // never below the floor
		expect(rentAt(step, 3)).toBe(30);
		expect(rentAt(step, 13)).toBe(0);
	});
	it('previews evenly spaced steps', () => {
		const steps = scaleSteps(scale, 4);
		expect(steps.map((s) => s.rentPerSqft)).toEqual([0, 1, 2, 3, 4]);
		expect(steps.map((s) => s.commissionPct)).toEqual([40, 32.5, 25, 17.5, 10]);
	});
});

describe('evaluate', () => {
	it('adds rent and commission and reports per sq ft and gap', () => {
		const o = evaluate({ sqft: 100, rentPerSqft: 2, commissionPct: 25, monthlySales: 2000 }, 3);
		expect(o.rent).toBe(200);
		expect(o.commission).toBe(500);
		expect(o.storeRevenue).toBe(700);
		expect(o.perSqft).toBe(7);
		expect(o.vendorNet).toBe(1500);
		expect(o.gapToTarget).toBe(0);
	});
	it('shows the shortfall against the target', () => {
		const o = evaluate({ sqft: 100, rentPerSqft: 1, commissionPct: 10, monthlySales: 500 }, 3);
		expect(o.storeRevenue).toBe(150);
		expect(o.gapToTarget).toBe(150);
	});
	it('handles zero square feet', () => {
		expect(evaluate({ sqft: 0, rentPerSqft: 2, commissionPct: 25, monthlySales: 100 }, 3).perSqft).toBeNull();
	});
});

describe('targets and break-even', () => {
	it('finds the rent needed for a target at given sales', () => {
		// 100 sqft × $3 = $300; 25% of $800 = $200; need $100 rent = $1/sqft
		expect(rentPerSqftForTarget(100, 3, 800, 25)).toBe(1);
		expect(rentPerSqftForTarget(100, 3, 5000, 25)).toBe(0);
	});
	it('finds the sales needed for a target at given rent', () => {
		expect(salesForTarget(100, 3, 1, 25)).toBe(800);
		expect(salesForTarget(100, 3, 1, 0)).toBeNull();
	});
	it('says how much rent must rise when sales fall short of the target', () => {
		// 100 sqft, target $3 → $300 needed; rent $1/sqft = $100; 13% of $1,000 = $130 → short $70
		expect(rentIncreaseForTarget(100, 3, 1, 13, 1000)).toBe(70);
		expect(rentIncreaseForTarget(100, 3, 1, 13, 5000)).toBe(0);
	});
	it('turns fixed costs into a break-even per sq ft', () => {
		const costs = normalizeCosts([{ name: 'Rent', amount: '5000' }, { name: ' Utilities ', amount: 800.456 }, { name: '', amount: 1 }, { name: 'bad', amount: 'x' }]);
		expect(costs).toEqual([{ name: 'Rent', amount: 5000 }, { name: 'Utilities', amount: 800.46 }]);
		expect(totalCosts(costs)).toBe(5800.46);
		expect(breakEvenPerSqft(5800.46, 3000)).toBe(1.93);
		expect(breakEvenPerSqft(100, 0)).toBeNull();
	});
	it('finds where two options earn the store the same', () => {
		// 100 sqft: A $2/sqft @ 25% vs B $0 @ 40%: 200 + .25s = .40s → s = 1333.33
		expect(breakEvenSales(100, { rentPerSqft: 2, commissionPct: 25 }, { rentPerSqft: 0, commissionPct: 40 })).toBe(1333.33);
		expect(breakEvenSales(100, { rentPerSqft: 2, commissionPct: 25 }, { rentPerSqft: 1, commissionPct: 25 })).toBeNull();
	});
});

describe('baseline', () => {
	const hist = [100, 200, null, 300, 400, 500];
	it('picks last / averages over known months', () => {
		expect(baselineSales(hist, 'last')).toBe(500);
		expect(baselineSales(hist, 'auto')).toBe(400);
		expect(baselineSales([null, 100, 300], 'auto')).toBe(200); // 2 months → 2-month avg
		expect(baselineSales([null, null, 300], 'auto')).toBe(300); // 1 month → that month
		expect(baselineSales(hist, 'avg3')).toBe(400);
		expect(baselineSales(hist, 'avg12')).toBe(300);
	});
	it('projects a trend one month ahead', () => {
		expect(baselineSales([100, 200, 300], 'trend')).toBe(400);
		expect(baselineSales([500, 400, 300, 200, 100, 0], 'trend')).toBe(0);
		expect(baselineSales([250], 'trend')).toBe(250);
	});
	it('returns null with no data or in manual mode', () => {
		expect(baselineSales([null, null], 'last')).toBeNull();
		expect(baselineSales(hist, 'manual')).toBeNull();
	});
	it('applies growth', () => {
		expect(applyGrowth(1000, 10)).toBe(1100);
		expect(applyGrowth(1000, -200)).toBe(0);
	});
});

describe('totals', () => {
	it('sums the selection and computes blended per sq ft', () => {
		const a = evaluate({ sqft: 100, rentPerSqft: 2, commissionPct: 25, monthlySales: 2000 });
		const b = evaluate({ sqft: 50, rentPerSqft: 0, commissionPct: 40, monthlySales: 1000 });
		const t = totals([
			{ sqft: 100, monthlySales: 2000, outcome: a },
			{ sqft: 50, monthlySales: 1000, outcome: b }
		]);
		expect(t).toEqual({ sqft: 150, sales: 3000, rent: 200, commission: 900, storeRevenue: 1100, perSqft: 7.33 });
	});
});
