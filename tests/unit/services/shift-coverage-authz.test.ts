/**
 * Authorization tests for shift claims.
 *
 * Regression guard for an IDOR found by security review: the web claim route
 * checked "were you invited?" in `load`, but SvelteKit form actions are
 * separate POST endpoints, so a signed-in user could POST straight to
 * `?/claim` with any claim code and take a shift they were never offered.
 *
 * The fix moved the check into claimShift/declineRequest, where every caller
 * gets it by default. These tests pin that default — the route-level guard is
 * UI convenience, this is the control.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
	request: null as Record<string, unknown> | null,
	/** Rows in shift_request_recipients for the request under test. */
	invitedUserIds: [] as string[],
	/** Which table the current select() is reading. */
	selectTargets: [] as string[],
	updateCalled: false,
	insertedResponses: [] as Record<string, unknown>[]
};

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));
vi.mock('$lib/server/twilio', () => ({
	sendSMS: vi.fn(async () => ({ success: true, sid: 'SM1' })),
	formatPhoneToE164: (p: string) => (p ? `+1${p.replace(/\D/g, '').slice(-10)}` : null)
}));
vi.mock('$lib/server/services/audit-service', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('$lib/server/utils/parse-claim-reply', () => ({ generateClaimCode: () => 'AB2C' }));
vi.mock('$lib/server/services/user-classification-service', () => ({
	VENDOR_USER_TYPE_NAME: 'Vendor'
}));

vi.mock('$lib/server/db', () => {
	const TABLES = {
		shiftRequests: 'shiftRequests',
		shiftRequestRecipients: 'shiftRequestRecipients',
		shiftRequestResponses: 'shiftRequestResponses',
		shifts: 'shifts',
		users: 'users',
		locations: 'locations',
		userTypes: 'userTypes',
		appSettings: 'appSettings',
		notifications: 'notifications',
		smsLogs: 'smsLogs'
	};

	const makeSelect = () => {
		const builder: Record<string, unknown> = {};
		let target = '';
		builder.from = (t: { __table?: string }) => {
			target = t?.__table ?? '';
			state.selectTargets.push(target);
			return builder;
		};
		for (const m of ['leftJoin', 'innerJoin', 'where', 'orderBy', 'limit']) {
			builder[m] = () => builder;
		}
		builder.then = (resolve: (v: unknown) => void) => {
			if (target === 'shiftRequests') return resolve(state.request ? [state.request] : []);
			if (target === 'shiftRequestRecipients') {
				// isInvitedRecipient filters by (requestId, userId); the harness
				// stands in for that by returning a row only when the user under
				// test is in invitedUserIds, set per-test.
				return resolve(state.invitedUserIds.length > 0 ? [{ id: 'rec-1' }] : []);
			}
			if (target === 'shifts') return resolve([]); // no conflicting shift
			return resolve([]);
		};
		return builder;
	};

	const db = {
		select: vi.fn(() => makeSelect()),
		selectDistinct: vi.fn(() => makeSelect()),
		update: vi.fn(() => {
			const b: Record<string, unknown> = {};
			b.set = () => b;
			b.where = () => b;
			b.returning = async () => {
				state.updateCalled = true;
				return [{ id: 'req-1' }];
			};
			b.then = (resolve: (v: unknown) => void) => resolve(undefined);
			return b;
		}),
		insert: vi.fn(() => {
			const b: Record<string, unknown> = {};
			b.values = (v: Record<string, unknown>) => {
				state.insertedResponses.push(v);
				return b;
			};
			b.onConflictDoNothing = () => b;
			b.onConflictDoUpdate = () => b;
			b.returning = async () => [{ id: 'x' }];
			b.then = (resolve: (v: unknown) => void) => resolve(undefined);
			return b;
		})
	};

	const tagged = Object.fromEntries(
		Object.entries(TABLES).map(([k, v]) => [k, { __table: v }])
	);

	return { db, ...tagged };
});

import { claimShift, declineRequest } from '../../../src/lib/server/services/shift-coverage-service';

const OPEN_REQUEST = {
	id: 'req-1',
	status: 'open',
	startTime: new Date('2026-10-02T17:00:00Z'),
	endTime: new Date('2026-10-02T23:00:00Z'),
	shiftId: 'shift-1',
	requestedBy: 'caller-outer',
	autoApply: false
};

beforeEach(() => {
	state.request = { ...OPEN_REQUEST };
	state.invitedUserIds = [];
	state.selectTargets = [];
	state.updateCalled = false;
	state.insertedResponses = [];
});

describe('claimShift authorization', () => {
	it('refuses a claim from someone who was never invited', async () => {
		state.invitedUserIds = []; // not a recipient

		const outcome = await claimShift({ requestId: 'req-1', userId: 'outsider', viaSms: false });

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.reason).toBe('not_invited');
		// The shift must not have been taken.
		expect(state.updateCalled).toBe(false);
	});

	it('explains the refusal without leaking the shift details', async () => {
		state.invitedUserIds = [];

		const outcome = await claimShift({ requestId: 'req-1', userId: 'outsider', viaSms: false });

		if (!outcome.ok) {
			expect(outcome.message).toMatch(/weren't asked to cover/i);
			expect(outcome.message).not.toMatch(/req-1|shift-1/);
		}
	});

	it('allows an invited recipient through', async () => {
		state.invitedUserIds = ['invitee'];

		const outcome = await claimShift({ requestId: 'req-1', userId: 'invitee', viaSms: false });

		expect(outcome.ok).toBe(true);
		expect(state.updateCalled).toBe(true);
	});

	it('checks recipients on the SMS path too, not just the web path', async () => {
		state.invitedUserIds = [];

		const outcome = await claimShift({ requestId: 'req-1', userId: 'outsider', viaSms: true });

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.reason).toBe('not_invited');
	});

	it('lets a manager assign someone who was not invited, when asked explicitly', async () => {
		state.invitedUserIds = [];

		const outcome = await claimShift({
			requestId: 'req-1',
			userId: 'not-invited-but-assigned',
			viaSms: false,
			requireRecipient: false
		});

		expect(outcome.ok).toBe(true);
		expect(state.updateCalled).toBe(true);
	});

	it('defaults to requiring a recipient when the flag is omitted', async () => {
		state.invitedUserIds = [];

		// The security property is the DEFAULT. A caller that forgets the option
		// must fail closed, not open.
		const outcome = await claimShift({ requestId: 'req-1', userId: 'outsider', viaSms: false });

		expect(outcome.ok).toBe(false);
	});

	it('still refuses an uninvited claim on a request that is already filled', async () => {
		state.request = { ...OPEN_REQUEST, status: 'filled' };
		state.invitedUserIds = [];

		const outcome = await claimShift({ requestId: 'req-1', userId: 'outsider', viaSms: false });

		expect(outcome.ok).toBe(false);
		expect(state.updateCalled).toBe(false);
	});
});

describe('declineRequest authorization', () => {
	it('writes no response row for someone who was never invited', async () => {
		state.invitedUserIds = [];

		await declineRequest({ requestId: 'req-1', userId: 'outsider', viaSms: false });

		expect(state.insertedResponses).toHaveLength(0);
	});

	it('records a decline from an invited recipient', async () => {
		state.invitedUserIds = ['invitee'];

		await declineRequest({ requestId: 'req-1', userId: 'invitee', viaSms: true });

		expect(state.insertedResponses).toHaveLength(1);
		expect(state.insertedResponses[0]).toMatchObject({
			requestId: 'req-1',
			userId: 'invitee',
			status: 'declined'
		});
	});
});
