/**
 * Tests for normalising the clock-out reply verdict.
 *
 * This object decides whether someone's time entry gets closed and at what
 * time, and it comes back from an LLM reading an untrusted SMS. So the contract
 * under test is defensive, not happy-path: every field is validated, anything
 * unexpected degrades to "hold it for a human", and the cautious direction is
 * always the one that doesn't cost someone pay.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));
vi.mock('$lib/ai/providers/anthropic', () => ({
	anthropicProvider: { complete: vi.fn() }
}));

import {
	normaliseAnalysis,
	fallbackAnalysis
} from '../../../src/lib/ai/office-manager/clock-out-reply';

const MODEL = 'test-model';

/** A well-formed "still working, customers present" verdict. */
function justifiedRaw(overrides: Record<string, unknown> = {}) {
	return {
		intent: 'still_working',
		justified: true,
		category: 'customers_present',
		statedClockOutTime: null,
		reason: 'Customers were still shopping at closing time.',
		needsManager: true,
		confidence: 'high',
		...overrides
	};
}

describe('fallbackAnalysis', () => {
	it('holds for a human rather than closing the entry', () => {
		const a = fallbackAnalysis('some text');

		expect(a.intent).toBe('unclear');
		expect(a.justified).toBe(false);
		expect(a.needsManager).toBe(true);
		expect(a.confidence).toBe('low');
		expect(a.model).toBe('fallback');
	});

	it('keeps the original text so a human can read it', () => {
		expect(fallbackAnalysis('still here with a customer').reason).toContain(
			'still here with a customer'
		);
	});

	it('truncates a very long reply instead of storing it whole', () => {
		const a = fallbackAnalysis('x'.repeat(500));
		expect(a.reason.length).toBeLessThan(200);
	});
});

describe('normaliseAnalysis — rejecting junk', () => {
	it.each([
		['null', null],
		['a string', 'still working'],
		['a number', 42],
		['an array', []]
	])('falls back on %s', (_label, input) => {
		expect(normaliseAnalysis(input, MODEL, 'reply').model).toBe('fallback');
	});

	it('falls back when the reason is missing — a verdict with no reason is unusable', () => {
		expect(normaliseAnalysis(justifiedRaw({ reason: undefined }), MODEL, 'r').model).toBe('fallback');
		expect(normaliseAnalysis(justifiedRaw({ reason: '   ' }), MODEL, 'r').model).toBe('fallback');
	});

	it('coerces an unknown intent to unclear rather than passing it through', () => {
		const a = normaliseAnalysis(justifiedRaw({ intent: 'wandered_off' }), MODEL, 'r');
		expect(a.intent).toBe('unclear');
	});

	it('coerces an unknown category to other', () => {
		const a = normaliseAnalysis(justifiedRaw({ category: 'alien_abduction' }), MODEL, 'r');
		expect(a.category).toBe('other');
	});

	it('caps an overlong reason', () => {
		const a = normaliseAnalysis(justifiedRaw({ reason: 'y'.repeat(900) }), MODEL, 'r');
		expect(a.reason.length).toBeLessThanOrEqual(300);
	});
});

describe('normaliseAnalysis — justified only counts while on the clock', () => {
	it('accepts justified for still_working', () => {
		expect(normaliseAnalysis(justifiedRaw(), MODEL, 'r').justified).toBe(true);
	});

	it.each(['already_left', 'will_clock_out', 'unclear'])(
		'strips justified when intent is %s',
		(intent) => {
			const a = normaliseAnalysis(justifiedRaw({ intent, reason: 'x' }), MODEL, 'r');
			expect(a.justified).toBe(false);
		}
	);

	it('treats a non-boolean justified as false', () => {
		expect(normaliseAnalysis(justifiedRaw({ justified: 'yes' }), MODEL, 'r').justified).toBe(false);
	});
});

describe('normaliseAnalysis — stated clock-out time', () => {
	it('keeps a valid HH:MM only for already_left', () => {
		const a = normaliseAnalysis(
			justifiedRaw({ intent: 'already_left', statedClockOutTime: '17:15', reason: 'Left at 5:15.' }),
			MODEL,
			'r'
		);
		expect(a.statedClockOutTime).toBe('17:15');
	});

	it('zero-pads a single-digit hour', () => {
		const a = normaliseAnalysis(
			justifiedRaw({ intent: 'already_left', statedClockOutTime: '9:05', reason: 'x' }),
			MODEL,
			'r'
		);
		expect(a.statedClockOutTime).toBe('09:05');
	});

	it('discards a time when they are still working — it would set the wrong clock-out', () => {
		const a = normaliseAnalysis(
			justifiedRaw({ intent: 'still_working', statedClockOutTime: '17:15' }),
			MODEL,
			'r'
		);
		expect(a.statedClockOutTime).toBeNull();
	});

	it.each([
		['out-of-range hour', '25:00'],
		['out-of-range minute', '12:75'],
		['12-hour text', '5:15 PM'],
		['not a time', 'later'],
		['empty', ''],
		['a number', 1715]
	])('rejects %s', (_label, value) => {
		const a = normaliseAnalysis(
			justifiedRaw({ intent: 'already_left', statedClockOutTime: value, reason: 'x' }),
			MODEL,
			'r'
		);
		expect(a.statedClockOutTime).toBeNull();
	});
});

describe('normaliseAnalysis — escalation is forced, not advisory', () => {
	it('pulls in a manager for justified overtime even if the model said not to', () => {
		const a = normaliseAnalysis(justifiedRaw({ needsManager: false }), MODEL, 'r');
		expect(a.needsManager).toBe(true);
	});

	it('pulls in a manager on low confidence even if the model said not to', () => {
		const a = normaliseAnalysis(
			justifiedRaw({ intent: 'already_left', justified: false, needsManager: false, confidence: 'low', reason: 'x' }),
			MODEL,
			'r'
		);
		expect(a.needsManager).toBe(true);
	});

	it('pulls in a manager for an unclear reply', () => {
		const a = normaliseAnalysis(
			justifiedRaw({ intent: 'unclear', needsManager: false, confidence: 'high', reason: 'x' }),
			MODEL,
			'r'
		);
		expect(a.needsManager).toBe(true);
	});

	it('leaves a confident forgot-to-clock-out alone — no manager needed', () => {
		const a = normaliseAnalysis(
			{
				intent: 'still_working',
				justified: false,
				category: 'forgot',
				statedClockOutTime: null,
				reason: 'Said they forgot to clock out.',
				needsManager: false,
				confidence: 'high'
			},
			MODEL,
			'r'
		);
		expect(a.needsManager).toBe(false);
		expect(a.justified).toBe(false);
	});
});
