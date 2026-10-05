/**
 * Tests for the attendance policy switchboard.
 *
 * The thing worth pinning here is fail-safe direction: the punitive machinery
 * must stay OFF when the setting is absent, unreadable, or garbage. A bug that
 * silently re-enabled automatic demerits is exactly what this config exists to
 * prevent, so "falls back to defaults" has to mean "falls back to disabled".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
	row: null as { value: string } | null,
	throwOnSelect: false,
	inserted: [] as { key: string; value: string }[]
};

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

vi.mock('$lib/server/db', () => {
	const makeSelect = () => {
		const builder: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit']) {
			builder[m] = () => builder;
		}
		builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
			if (state.throwOnSelect) return reject(new Error('db down'));
			return resolve(state.row ? [state.row] : []);
		};
		return builder;
	};

	return {
		db: {
			select: vi.fn(() => makeSelect()),
			insert: vi.fn(() => {
				const builder: Record<string, unknown> = {};
				builder.values = (v: { key: string; value: string }) => {
					state.inserted.push(v);
					return builder;
				};
				builder.onConflictDoUpdate = () => builder;
				builder.then = (resolve: (v: unknown) => void) => resolve(undefined);
				return builder;
			})
		},
		appSettings: { key: 'key', value: 'value', updatedAt: 'updated_at' }
	};
});

import {
	getAttendancePolicyConfig,
	updateAttendancePolicyConfig,
	DEFAULT_ATTENDANCE_POLICY
} from '../../../src/lib/server/services/attendance-policy-service';

beforeEach(() => {
	state.row = null;
	state.throwOnSelect = false;
	state.inserted = [];
});

describe('default policy', () => {
	it('has the punitive machinery off', () => {
		expect(DEFAULT_ATTENDANCE_POLICY.demeritsEnabled).toBe(false);
		expect(DEFAULT_ATTENDANCE_POLICY.lateArrivalWarningsEnabled).toBe(false);
		expect(DEFAULT_ATTENDANCE_POLICY.clockOutPointsPenaltyEnabled).toBe(false);
	});

	it('keeps the single clock-out reminder on, closing 10 min later', () => {
		expect(DEFAULT_ATTENDANCE_POLICY.clockOutNagEnabled).toBe(true);
		expect(DEFAULT_ATTENDANCE_POLICY.autoCloseAfterNagMinutes).toBe(10);
	});
});

describe('getAttendancePolicyConfig', () => {
	it('returns defaults when nothing is stored', async () => {
		expect(await getAttendancePolicyConfig()).toEqual(DEFAULT_ATTENDANCE_POLICY);
	});

	it('merges a partial stored config over the defaults', async () => {
		state.row = { value: JSON.stringify({ nagDelayMinutes: 45 }) };
		const config = await getAttendancePolicyConfig();
		expect(config.nagDelayMinutes).toBe(45);
		// Unspecified keys keep their defaults rather than becoming undefined.
		expect(config.demeritsEnabled).toBe(false);
		expect(config.backstopMinutes).toBe(DEFAULT_ATTENDANCE_POLICY.backstopMinutes);
	});

	it('honours an explicit re-enable', async () => {
		state.row = { value: JSON.stringify({ demeritsEnabled: true }) };
		expect((await getAttendancePolicyConfig()).demeritsEnabled).toBe(true);
	});

	it('falls back to disabled on malformed JSON', async () => {
		state.row = { value: '{not json' };
		expect(await getAttendancePolicyConfig()).toEqual(DEFAULT_ATTENDANCE_POLICY);
	});

	it('falls back to disabled when the DB read fails', async () => {
		state.throwOnSelect = true;
		expect(await getAttendancePolicyConfig()).toEqual(DEFAULT_ATTENDANCE_POLICY);
	});
});

describe('updateAttendancePolicyConfig', () => {
	it('persists the merged config, not just the patch', async () => {
		state.row = { value: JSON.stringify({ nagDelayMinutes: 45 }) };

		const next = await updateAttendancePolicyConfig({ demeritsEnabled: true });

		expect(next.demeritsEnabled).toBe(true);
		expect(next.nagDelayMinutes).toBe(45);

		const stored = JSON.parse(state.inserted[0].value);
		expect(stored.demeritsEnabled).toBe(true);
		expect(stored.nagDelayMinutes).toBe(45);
		expect(stored.backstopMinutes).toBe(DEFAULT_ATTENDANCE_POLICY.backstopMinutes);
	});
});
