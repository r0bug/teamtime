/**
 * Contract tests for shift coverage.
 *
 * The concurrency guarantee itself (N simultaneous claims -> exactly 1 winner)
 * was verified against a real PostgreSQL instance; there is no test database
 * wired up here, so these tests pin the *contract* that makes it hold:
 *   - the claim is a conditional UPDATE guarded on status='open'
 *   - an empty RETURNING means someone else won, not an error
 * If anyone rewrites this as a read-then-write, these fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
	request: null as Record<string, unknown> | null,
	conflict: null as Record<string, unknown> | null,
	updateWhereCalls: [] as unknown[],
	claimWins: true
};

vi.mock('$lib/server/twilio', () => ({
	sendSMS: vi.fn(async () => ({ success: true, sid: 'SM1' })),
	formatPhoneToE164: (p: string) => (p ? `+1${p.replace(/\D/g, '').slice(-10)}` : null)
}));
vi.mock('$lib/server/services/audit-service', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

vi.mock('$lib/server/db', () => {
	// Minimal thenable query builder. select() resolves to whatever the current
	// test staged; update() records its WHERE clause so we can assert the guard.
	const makeSelect = (rows: unknown[]) => {
		const builder: Record<string, unknown> = {};
		for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit']) {
			builder[m] = () => builder;
		}
		builder.then = (resolve: (v: unknown) => void) => resolve(rows);
		return builder;
	};

	const db = {
		select: vi.fn(() => {
			// First select in claimShift = the request; second = conflict lookup.
			const calls = (db.select as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
			if (calls === 1) return makeSelect(state.request ? [state.request] : []);
			if (calls === 2) return makeSelect(state.conflict ? [state.conflict] : []);
			return makeSelect(state.request ? [state.request] : []);
		}),
		update: vi.fn(() => {
			const builder: Record<string, unknown> = {};
			builder.set = () => builder;
			builder.where = (clause: unknown) => {
				state.updateWhereCalls.push(clause);
				return builder;
			};
			builder.returning = async () => (state.claimWins ? [{ id: 'req-1' }] : []);
			builder.then = (resolve: (v: unknown) => void) => resolve(undefined);
			return builder;
		}),
		insert: vi.fn(() => {
			const builder: Record<string, unknown> = {};
			builder.values = () => builder;
			builder.onConflictDoNothing = async () => undefined;
			builder.onConflictDoUpdate = async () => undefined;
			builder.catch = async () => undefined;
			builder.then = (resolve: (v: unknown) => void) => resolve(undefined);
			return builder;
		}),
		selectDistinct: vi.fn(() => makeSelect([]))
	};

	return {
		db,
		shifts: {}, users: {}, locations: {}, userTypes: {}, appSettings: {},
		notifications: {}, smsLogs: {}, shiftRequests: {},
		shiftRequestRecipients: {}, shiftRequestResponses: {}
	};
});

// drizzle operators just need to be inert, recordable markers here.
vi.mock('drizzle-orm', () => {
	const op = (name: string) => (...args: unknown[]) => ({ __op: name, args });
	return {
		and: op('and'), eq: op('eq'), gte: op('gte'), lte: op('lte'),
		lt: op('lt'), ne: op('ne'), inArray: op('inArray'), isNotNull: op('isNotNull')
	};
});

import { claimShift, buildBroadcastMessage, formatShiftLabel, defaultDeadline } from '$lib/server/services/shift-coverage-service';

const OPEN_REQUEST = {
	id: 'req-1',
	status: 'open',
	startTime: new Date('2026-09-17T17:00:00Z'),
	endTime: new Date('2026-09-17T23:00:00Z'),
	shiftId: 'shift-1',
	autoApply: true,
	requestedBy: 'user-requester',
	locationId: null
};

beforeEach(() => {
	state.request = { ...OPEN_REQUEST };
	state.conflict = null;
	state.updateWhereCalls = [];
	state.claimWins = true;
	vi.clearAllMocks();
});

describe('claimShift', () => {
	it('guards the claim UPDATE on status = open', async () => {
		await claimShift({ requestId: 'req-1', userId: 'user-a', viaSms: true });

		// The guard is what makes concurrent claims safe. It must be part of the
		// UPDATE's WHERE clause, not a prior SELECT.
		const serialized = JSON.stringify(state.updateWhereCalls);
		expect(serialized).toContain('"__op":"and"');
		expect(serialized).toContain('open');
	});

	it('reports already_filled when the UPDATE matches no rows', async () => {
		state.claimWins = false; // someone else won the race
		const outcome = await claimShift({ requestId: 'req-1', userId: 'user-b', viaSms: true });

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.reason).toBe('already_filled');
			expect(outcome.message).toMatch(/already covered/i);
		}
	});

	it('refuses a request that is no longer open', async () => {
		state.request = { ...OPEN_REQUEST, status: 'filled' };
		const outcome = await claimShift({ requestId: 'req-1', userId: 'user-c', viaSms: true });

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.reason).toBe('already_filled');
	});

	it('re-checks for a conflicting shift at claim time, not just at broadcast', async () => {
		state.conflict = {
			startTime: new Date('2026-09-17T16:00:00Z'),
			endTime: new Date('2026-09-17T22:00:00Z')
		};
		const outcome = await claimShift({ requestId: 'req-1', userId: 'user-d', viaSms: true });

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.reason).toBe('conflict');
			// and it must not have attempted the claim at all
			expect(state.updateWhereCalls).toHaveLength(0);
		}
	});

	it('returns not_found for a missing request', async () => {
		state.request = null;
		const outcome = await claimShift({ requestId: 'nope', userId: 'user-e', viaSms: true });
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.reason).toBe('not_found');
	});
});

describe('buildBroadcastMessage', () => {
	const start = new Date('2026-09-17T17:00:00Z');
	const end = new Date('2026-09-17T23:00:00Z');

	it('omits the code when the recipient has only one open invite', () => {
		const msg = buildBroadcastMessage({ start, end, locationName: 'Main', claimCode: '4F2K', includeCode: false });
		expect(msg).toContain('Reply YES to claim');
		expect(msg).not.toContain('4F2K');
	});

	it('includes the code when the recipient has more than one', () => {
		const msg = buildBroadcastMessage({ start, end, locationName: 'Main', claimCode: '4F2K', includeCode: true });
		expect(msg).toContain('YES 4F2K');
	});

	it('never leaks the requester reason', () => {
		const msg = buildBroadcastMessage({ start, end, locationName: 'Main', claimCode: '4F2K', includeCode: false });
		expect(msg.toLowerCase()).not.toContain('sick');
	});

	it('stays within two SMS segments including the header twilio.ts prepends', () => {
		const header = 'Yakima Finds Communiqué: '.length;
		const msg = buildBroadcastMessage({
			start, end, locationName: 'Warehouse District', claimCode: '4F2K', includeCode: true
		});
		expect(header + msg.length).toBeLessThanOrEqual(306); // 2 segments
	});
});

describe('defaultDeadline', () => {
	it('never lands after the shift starts', () => {
		const start = new Date(Date.now() + 60 * 60 * 1000); // 1hr out
		const deadline = defaultDeadline(start, 4);
		expect(deadline.getTime()).toBeLessThan(start.getTime());
	});

	it('caps at the configured window for a distant shift', () => {
		const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
		const deadline = defaultDeadline(start, 4);
		expect(deadline.getTime()).toBeLessThanOrEqual(Date.now() + 4 * 3600_000 + 1000);
	});
});

describe('formatShiftLabel', () => {
	it('renders a Pacific-time range', () => {
		const label = formatShiftLabel(
			new Date('2026-09-17T17:00:00Z'),
			new Date('2026-09-17T23:00:00Z')
		);
		expect(label).toMatch(/Thu/);
		expect(label).toMatch(/10:00 AM-4:00 PM/);
	});
});
