/**
 * Tests for threading the flat sms_logs table into conversations.
 *
 * The interesting cases are all about identity and ordering:
 *   - one person's messages must not split across stored phone formats
 *   - the counterparty is `to` on outbound rows and `from` on inbound rows
 *   - a thread reads oldest-first even though the query returns newest-first
 *   - "awaiting reply" means the newest message is theirs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Row {
	id: string;
	direction: 'inbound' | 'outbound';
	status: string;
	body: string | null;
	fromNumber: string;
	toNumber: string;
	createdAt: Date;
	errorMessage: string | null;
	userId: string | null;
	counterpartyName: string | null;
	vendorId: string | null;
	vendorName: string | null;
	boothNumber: string | null;
	sentByName: string | null;
}

const state = { rows: [] as Row[], throwOnSelect: false };

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

vi.mock('drizzle-orm/pg-core', () => ({
	alias: (table: unknown, name: string) => ({ __alias: name, table })
}));

vi.mock('$lib/server/db', () => {
	const makeSelect = () => {
		const builder: Record<string, unknown> = {};
		for (const m of ['from', 'leftJoin', 'orderBy', 'limit']) {
			builder[m] = () => builder;
		}
		builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
			if (state.throwOnSelect) return reject(new Error('db down'));
			return resolve(state.rows);
		};
		return builder;
	};

	return {
		db: { select: vi.fn(() => makeSelect()) },
		smsLogs: {},
		users: { id: 'id', name: 'name' },
		vendors: { id: 'id', displayName: 'display_name', boothNumber: 'booth_number' }
	};
});

import { listSmsThreads } from '../../../src/lib/server/services/sms-log-service';

const OURS = '+15095550000';

/** Build a row with sensible blanks; `createdAt` is minutes past a fixed epoch. */
function row(partial: Partial<Row> & { id: string; minute: number }): Row {
	const { minute, ...rest } = partial;
	return {
		direction: 'outbound',
		status: 'sent',
		body: 'hello',
		fromNumber: OURS,
		toNumber: '+15095551111',
		createdAt: new Date(Date.UTC(2026, 9, 1, 12, minute)),
		errorMessage: null,
		userId: null,
		counterpartyName: null,
		vendorId: null,
		vendorName: null,
		boothNumber: null,
		sentByName: null,
		...rest
	} as Row;
}

/** The service reads newest-first, as the real ORDER BY does. */
function newestFirst(rows: Row[]): Row[] {
	return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

beforeEach(() => {
	state.rows = [];
	state.throwOnSelect = false;
});

describe('listSmsThreads', () => {
	it('returns nothing when the log is empty', async () => {
		expect(await listSmsThreads()).toEqual([]);
	});

	it('returns nothing rather than throwing when the query fails', async () => {
		state.throwOnSelect = true;
		expect(await listSmsThreads()).toEqual([]);
	});

	it('groups both directions of one conversation into a single thread', async () => {
		state.rows = newestFirst([
			row({ id: 'a', minute: 0, direction: 'outbound', toNumber: '+15095551111', body: 'Can you cover Sat?' }),
			row({ id: 'b', minute: 5, direction: 'inbound', fromNumber: '+15095551111', toNumber: OURS, body: 'yes i can' })
		]);

		const threads = await listSmsThreads();

		expect(threads).toHaveLength(1);
		expect(threads[0].messageCount).toBe(2);
		// Oldest first, so it reads like a conversation.
		expect(threads[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
	});

	it('threads a person together across stored phone formats', async () => {
		state.rows = newestFirst([
			row({ id: 'a', minute: 0, toNumber: '(509) 555-1111' }),
			row({ id: 'b', minute: 1, toNumber: '509-555-1111' }),
			row({ id: 'c', minute: 2, toNumber: '+15095551111' })
		]);

		const threads = await listSmsThreads();

		expect(threads).toHaveLength(1);
		expect(threads[0].messageCount).toBe(3);
	});

	it('keeps separate people in separate threads, newest activity first', async () => {
		state.rows = newestFirst([
			row({ id: 'old', minute: 0, toNumber: '+15095551111' }),
			row({ id: 'new', minute: 30, toNumber: '+15095552222' })
		]);

		const threads = await listSmsThreads();

		expect(threads).toHaveLength(2);
		expect(threads[0].messages[0].id).toBe('new');
		expect(threads[1].messages[0].id).toBe('old');
	});

	it('flags a thread as awaiting reply only when their message is newest', async () => {
		state.rows = newestFirst([
			row({ id: 'a', minute: 0, direction: 'outbound', toNumber: '+15095551111' }),
			row({ id: 'b', minute: 5, direction: 'inbound', fromNumber: '+15095551111', toNumber: OURS })
		]);
		expect((await listSmsThreads())[0].awaitingReply).toBe(true);

		state.rows = newestFirst([
			row({ id: 'a', minute: 0, direction: 'inbound', fromNumber: '+15095551111', toNumber: OURS }),
			row({ id: 'b', minute: 5, direction: 'outbound', toNumber: '+15095551111' })
		]);
		expect((await listSmsThreads())[0].awaitingReply).toBe(false);
	});

	it('identifies a vendor counterparty and surfaces the booth', async () => {
		state.rows = [
			row({
				id: 'a',
				minute: 0,
				toNumber: '+15095553333',
				vendorId: 'v1',
				vendorName: 'R. Alvarez',
				boothNumber: '12'
			})
		];

		const [thread] = await listSmsThreads();

		expect(thread.counterpartyKind).toBe('vendor');
		expect(thread.counterpartyName).toBe('R. Alvarez');
		expect(thread.boothNumber).toBe('12');
		expect(thread.vendorId).toBe('v1');
	});

	it('marks a number matching nobody as unknown', async () => {
		state.rows = [row({ id: 'a', minute: 0, toNumber: '+15095559999' })];

		const [thread] = await listSmsThreads();

		expect(thread.counterpartyKind).toBe('unknown');
		expect(thread.counterpartyName).toBeNull();
	});

	it('recovers identity from an older row when the newest one lacks it', async () => {
		// Vendor matching started partway through this conversation, so only the
		// earlier row carries the vendor link.
		state.rows = newestFirst([
			row({ id: 'old', minute: 0, toNumber: '+15095553333', vendorId: 'v1', vendorName: 'R. Alvarez', boothNumber: '12' }),
			row({ id: 'new', minute: 10, toNumber: '+15095553333' })
		]);

		const [thread] = await listSmsThreads();

		expect(thread.counterpartyKind).toBe('vendor');
		expect(thread.counterpartyName).toBe('R. Alvarez');
	});

	it('carries the sending manager through to each outbound message', async () => {
		state.rows = newestFirst([
			row({ id: 'a', minute: 0, sentByName: 'Mike' }),
			row({ id: 'b', minute: 1, sentByName: null }) // cron / system send
		]);

		const [thread] = await listSmsThreads();

		expect(thread.messages.find((m) => m.id === 'a')?.sentByName).toBe('Mike');
		expect(thread.messages.find((m) => m.id === 'b')?.sentByName).toBeNull();
	});

	it('respects the thread limit, dropping the stalest conversations', async () => {
		state.rows = newestFirst([
			row({ id: 'a', minute: 0, toNumber: '+15095551111' }),
			row({ id: 'b', minute: 10, toNumber: '+15095552222' }),
			row({ id: 'c', minute: 20, toNumber: '+15095553333' })
		]);

		const threads = await listSmsThreads({ threadLimit: 2 });

		expect(threads).toHaveLength(2);
		expect(threads.map((t) => t.messages[0].id)).toEqual(['c', 'b']);
	});

	it('skips rows with no counterparty number instead of making a junk thread', async () => {
		state.rows = [row({ id: 'a', minute: 0, toNumber: '' })];
		expect(await listSmsThreads()).toEqual([]);
	});
});
