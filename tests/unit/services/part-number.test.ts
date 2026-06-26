import { describe, it, expect } from 'vitest';
import { partNumberMatchesPrefix } from '$lib/server/services/part-number';

describe('partNumberMatchesPrefix (vendor ownership, case-insensitive)', () => {
	it('matches regardless of case', () => {
		expect(partNumberMatchesPrefix('SR60526001', 'SR')).toBe(true);
		expect(partNumberMatchesPrefix('sr60526001', 'SR')).toBe(true);
		expect(partNumberMatchesPrefix('Sr60526001', 'sr')).toBe(true);
	});

	it('rejects a different prefix', () => {
		expect(partNumberMatchesPrefix('AB60526001', 'SR')).toBe(false);
	});

	it('rejects an empty prefix (no ownership scope — fail closed)', () => {
		expect(partNumberMatchesPrefix('SR60526001', '')).toBe(false);
	});
});
