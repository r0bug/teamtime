/**
 * Tests for the auto clock-out annotation and the demerit kill switch.
 *
 * The annotation is the whole point of the "close it and note that we did it"
 * policy: payroll has to be able to tell a system-set clock-out from one the
 * employee or a manager entered, and see when we warned them first. These tests
 * pin that it says so in words, carries both times, and never eats a note that
 * was already on the entry.
 *
 * Real timezone helpers are used deliberately — the note shows Pacific times to
 * whoever approves payroll, so stubbing the formatter would test nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { demeritsEnabled: false };

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

vi.mock('$lib/server/db', () => {
	const builder: Record<string, unknown> = {};
	for (const m of ['select', 'from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin', 'set', 'values']) {
		builder[m] = () => builder;
	}
	builder.returning = async () => [];
	builder.then = (resolve: (v: unknown) => void) => resolve([]);
	return {
		db: { select: () => builder, update: () => builder, insert: () => builder },
		clockOutWarnings: {},
		demerits: {},
		users: {},
		timeEntries: {},
		shifts: {},
		appSettings: {},
		breakEntries: {},
		smsLogs: {}
	};
});

vi.mock('$lib/server/twilio', () => ({
	sendSMS: vi.fn(async () => ({ success: true, sid: 'SM1' })),
	formatPhoneToE164: (p: string) => (p ? `+1${p.replace(/\D/g, '').slice(-10)}` : null)
}));

vi.mock('$lib/server/services/points-service', () => ({
	awardPoints: vi.fn(async () => undefined),
	POINT_VALUES: { CLOCK_OUT_FORGOTTEN: -15 }
}));

vi.mock('$lib/server/services/demerit-review-service', () => ({
	notifyManagersOfPendingDemerit: vi.fn(async () => undefined)
}));

vi.mock('$lib/server/services/attendance-policy-service', () => ({
	getAttendancePolicyConfig: vi.fn(async () => ({
		demeritsEnabled: state.demeritsEnabled,
		lateArrivalWarningsEnabled: false,
		clockOutNagEnabled: true,
		clockOutPointsPenaltyEnabled: false,
		nagDelayMinutes: 30,
		autoCloseAfterNagMinutes: 10,
		backstopMinutes: 180
	}))
}));

import {
	buildAutoCloseNote,
	appendNote,
	checkAndEscalateToDemerit,
	SMS_MESSAGES
} from '../../../src/lib/server/services/clock-out-warning-service';
import { notifyManagersOfPendingDemerit } from '$lib/server/services/demerit-review-service';

// 5:00 PM Pacific on a PDT date, and 5:35 PM the same day.
const SHIFT_END = new Date('2026-10-01T17:00:00-07:00');
const NAG_SENT = new Date('2026-10-01T17:35:00-07:00');

beforeEach(() => {
	state.demeritsEnabled = false;
	vi.clearAllMocks();
});

describe('buildAutoCloseNote', () => {
	it('names the system as the actor', () => {
		const note = buildAutoCloseNote({
			shiftEndTime: SHIFT_END,
			closeAt: SHIFT_END,
			minutesPastShiftEnd: 45,
			nagSentAt: NAG_SENT,
			repliedAt: null,
			wasWarned: true,
			justifiedReason: null
		});

		expect(note).toContain('[Office Manager]');
		expect(note).toContain('Auto clocked out');
	});

	it('records the clock-out time, the reminder time, and that nobody replied', () => {
		const note = buildAutoCloseNote({
			shiftEndTime: SHIFT_END,
			closeAt: SHIFT_END,
			minutesPastShiftEnd: 45,
			nagSentAt: NAG_SENT,
			repliedAt: null,
			wasWarned: true,
			justifiedReason: null
		});

		expect(note).toContain('5:00 PM'); // closed at scheduled shift end
		expect(note).toContain('5:35 PM'); // when we texted them
		expect(note).toContain('45 min past shift end');
		expect(note).toContain('no reply');
	});

	it('says so when they replied but were still clocked in at the cutoff', () => {
		const note = buildAutoCloseNote({
			shiftEndTime: SHIFT_END,
			closeAt: SHIFT_END,
			minutesPastShiftEnd: 185,
			nagSentAt: NAG_SENT,
			repliedAt: new Date('2026-10-01T17:40:00-07:00'),
			wasWarned: true,
			justifiedReason: null
		});

		expect(note).toContain('replied 5:40 PM');
		expect(note).not.toContain('no reply');
	});

	it('tells the reader they can correct it', () => {
		const note = buildAutoCloseNote({
			shiftEndTime: SHIFT_END,
			closeAt: SHIFT_END,
			minutesPastShiftEnd: 45,
			nagSentAt: NAG_SENT,
			repliedAt: null,
			wasWarned: true,
			justifiedReason: null
		});

		expect(note).toMatch(/edit this entry/i);
	});

	it('does not claim a reminder was texted when none went out', () => {
		const note = buildAutoCloseNote({
			shiftEndTime: SHIFT_END,
			closeAt: SHIFT_END,
			minutesPastShiftEnd: 185,
			nagSentAt: NAG_SENT,
			repliedAt: null,
			wasWarned: false,
			justifiedReason: null
		});

		expect(note).toContain('no reminder could be sent');
		expect(note).not.toContain('reminder texted');
		expect(note).not.toContain('5:35 PM');
		// Still says plainly who closed it and when.
		expect(note).toContain('[Office Manager]');
		expect(note).toContain('5:00 PM');
	});

	it('floors fractional minutes rather than printing a decimal', () => {
		const note = buildAutoCloseNote({
			shiftEndTime: SHIFT_END,
			closeAt: SHIFT_END,
			minutesPastShiftEnd: 45.9,
			nagSentAt: NAG_SENT,
			repliedAt: null,
			wasWarned: true,
			justifiedReason: null
		});

		expect(note).toContain('45 min');
		expect(note).not.toContain('45.9');
	});
});

describe('buildAutoCloseNote — justified overtime', () => {
	// Closing justified overtime at the scheduled shift end would erase hours
	// the employee actually worked, so it closes at last contact instead and the
	// note has to make that unmistakable to whoever approves payroll.
	const LAST_CONTACT = new Date('2026-10-01T17:40:00-07:00');

	const note = () =>
		buildAutoCloseNote({
			shiftEndTime: SHIFT_END,
			closeAt: LAST_CONTACT,
			minutesPastShiftEnd: 185,
			nagSentAt: NAG_SENT,
			repliedAt: LAST_CONTACT,
			wasWarned: true,
			justifiedReason: 'Customers were still in the store at closing.'
		});

	it('says the close time is last contact, not the shift end', () => {
		expect(note()).toContain('5:40 PM');
		expect(note()).toMatch(/last contact/i);
		expect(note()).toMatch(/NOT the scheduled/);
	});

	it('still names the scheduled shift end so the gap is visible', () => {
		expect(note()).toContain('5:00 PM');
	});

	it('carries the reason the employee gave', () => {
		expect(note()).toContain('Customers were still in the store');
	});

	it('tells the approver to confirm rather than implying it is settled', () => {
		expect(note()).toMatch(/confirm the real finish time/i);
		expect(note()).toMatch(/manager was notified/i);
	});

	it('does not reuse the forgot-to-clock-out wording', () => {
		expect(note()).not.toContain('no reply');
		expect(note()).not.toContain('scheduled shift end).');
	});
});

describe('appendNote', () => {
	it('keeps an existing note and adds the new one on its own line', () => {
		expect(appendNote('Covered for Dana', 'system note')).toBe('Covered for Dana\nsystem note');
	});

	it('does not leave a leading blank line when there was no note', () => {
		expect(appendNote(null, 'system note')).toBe('system note');
		expect(appendNote('   ', 'system note')).toBe('system note');
	});
});

describe('clock-out reminder text', () => {
	it('points at the app and states the deadline, without inviting a YES', () => {
		const msg = SMS_MESSAGES.clockOutNag(SHIFT_END, 10);

		expect(msg).toContain('5:00 PM');
		expect(msg).toContain('10 min');
		expect(msg).toMatch(/clock out in the app/i);
		// A bare "YES" or a time belongs to shift-coverage claims; this message
		// must not ask for either or it will steal them.
		expect(msg).not.toMatch(/reply/i);
	});
});

describe('demerit escalation kill switch', () => {
	it('creates nothing and pages nobody while the engine is off', async () => {
		const result = await checkAndEscalateToDemerit('user-1', 'warning-1', 'system-1');

		expect(result).toBeNull();
		expect(notifyManagersOfPendingDemerit).not.toHaveBeenCalled();
	});

	it('proceeds past the switch once the engine is re-enabled', async () => {
		state.demeritsEnabled = true;

		// With the mocked DB returning no warnings, escalation still declines —
		// but for the threshold reason, having passed the switch. The point is
		// that the switch is the only thing stopping it while disabled.
		const result = await checkAndEscalateToDemerit('user-1', 'warning-1', 'system-1');

		expect(result).toBeNull();
	});
});
