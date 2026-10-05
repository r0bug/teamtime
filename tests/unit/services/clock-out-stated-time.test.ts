/**
 * Tests for accepting a self-reported clock-out time.
 *
 * An employee texting "I left at 5:15" directly sets paid hours, so this is a
 * trust boundary: the time is bounded on every side rather than believed. A
 * rejected time costs someone a manager conversation; an accepted bad one goes
 * straight into payroll.
 *
 * Real timezone helpers are used — the whole point is converting a Pacific
 * wall-clock time against a UTC clock-in, and stubbing that would test nothing.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));
vi.mock('$lib/server/db', () => {
	const builder: Record<string, unknown> = {};
	for (const m of ['select', 'from', 'where', 'orderBy', 'limit', 'innerJoin', 'set', 'values', 'update']) {
		builder[m] = () => builder;
	}
	builder.then = (resolve: (v: unknown) => void) => resolve([]);
	return {
		db: { select: () => builder, update: () => builder, insert: () => builder },
		clockOutWarnings: {},
		timeEntries: {},
		users: {},
		breakEntries: {}
	};
});
vi.mock('$lib/server/twilio', () => ({
	sendSMS: vi.fn(async () => ({ success: true })),
	formatPhoneToE164: (p: string) => (p ? `+1${p.replace(/\D/g, '').slice(-10)}` : null)
}));
vi.mock('$lib/ai/office-manager/clock-out-reply', () => ({
	interpretClockOutReply: vi.fn()
}));
vi.mock('$lib/server/services/clock-out-warning-service', () => ({
	appendNote: (existing: string | null, addition: string) =>
		existing ? `${existing}\n${addition}` : addition
}));

import { resolveStatedClockOut } from '../../../src/lib/server/services/clock-out-reply-service';

// A day-shift clock-in at 9:00 AM Pacific, with "now" at 6:00 PM the same day.
const CLOCK_IN = new Date('2026-10-01T09:00:00-07:00');
const NOW = new Date('2026-10-01T18:00:00-07:00');

describe('resolveStatedClockOut — accepting', () => {
	it('accepts a time between clock-in and now', () => {
		const result = resolveStatedClockOut('17:15', CLOCK_IN, NOW);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.at.toISOString()).toBe(new Date('2026-10-01T17:15:00-07:00').toISOString());
		}
	});

	it('resolves against the Pacific calendar day of the clock-in, not UTC', () => {
		// 2026-10-01T09:00-07:00 is 16:00 UTC the same day, but an evening
		// clock-in would be the *next* UTC day — the shift date must follow
		// Pacific or the resolved time lands 24 hours out.
		const eveningClockIn = new Date('2026-10-01T18:00:00-07:00'); // 01:00 UTC Oct 2
		const laterThatEvening = new Date('2026-10-01T22:00:00-07:00');

		const result = resolveStatedClockOut('21:30', eveningClockIn, laterThatEvening);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.at.toISOString()).toBe(new Date('2026-10-01T21:30:00-07:00').toISOString());
		}
	});

	it('rolls past midnight for a shift that crosses the date line', () => {
		const nightClockIn = new Date('2026-10-01T20:00:00-07:00');
		const afterMidnight = new Date('2026-10-02T01:00:00-07:00');

		const result = resolveStatedClockOut('00:30', nightClockIn, afterMidnight);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.at.toISOString()).toBe(new Date('2026-10-02T00:30:00-07:00').toISOString());
			expect(result.at.getTime()).toBeGreaterThan(nightClockIn.getTime());
		}
	});

	it('allows a few minutes of clock skew into the future', () => {
		const result = resolveStatedClockOut('18:03', CLOCK_IN, NOW);
		expect(result.ok).toBe(true);
	});
});

describe('resolveStatedClockOut — rejecting', () => {
	it('rejects a time before clock-in', () => {
		// 08:00 is before the 09:00 clock-in; rolling it forward 24h would then
		// be in the future, so it must be refused either way.
		const result = resolveStatedClockOut('08:00', CLOCK_IN, NOW);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.why).toMatch(/hasn't happened yet|before you clocked in/);
	});

	it('rejects a time that has not happened yet', () => {
		const result = resolveStatedClockOut('19:30', CLOCK_IN, NOW);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.why).toMatch(/hasn't happened yet/);
	});

	it('rejects an implausibly long shift', () => {
		const oldClockIn = new Date('2026-09-30T06:00:00-07:00');
		const now = new Date('2026-10-01T18:00:00-07:00');

		// 17:00 on the clock-in's day is 35 hours before now and would roll
		// forward, but either reading exceeds the 16-hour cap.
		const result = resolveStatedClockOut('23:00', oldClockIn, now);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.why).toMatch(/hour shift/);
	});

	it('gives a reason an employee can act on, not an error code', () => {
		const result = resolveStatedClockOut('19:30', CLOCK_IN, NOW);
		if (!result.ok) {
			expect(result.why).not.toMatch(/error|invalid|null|undefined/i);
			expect(result.why.length).toBeGreaterThan(10);
		}
	});
});
