/**
 * SMS Log Service
 *
 * Turns the flat `sms_logs` table into conversation threads for /admin/sms.
 *
 * The raw log is two separate streams (outbound rows and inbound rows) and
 * answers "what did we send?" but not "what did we say to this person, and
 * what did they say back?". This groups both directions by the counterparty's
 * number so a conversation reads top to bottom, and names the staff member who
 * caused each outbound message instead of attributing everything to the system.
 *
 * Threading is by phone number rather than by user: a vendor may have no user
 * account, a number may be shared, and numbers change hands. The number is the
 * one thing every row has.
 */

import { db, smsLogs, users, vendors } from '$lib/server/db';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:sms-log');

/** How many log rows to thread. Threads are built in memory from this window. */
const DEFAULT_MESSAGE_WINDOW = 400;
const DEFAULT_THREAD_LIMIT = 50;

export interface SmsThreadMessage {
	id: string;
	direction: 'inbound' | 'outbound';
	status: string;
	body: string | null;
	createdAt: Date;
	/** Staff member who caused an outbound message; null for system sends. */
	sentByName: string | null;
	errorMessage: string | null;
}

export interface SmsThread {
	/** Stable id for the thread — the normalised counterparty number. */
	key: string;
	/** Counterparty number as last seen, for display. */
	phone: string;
	counterpartyName: string | null;
	counterpartyKind: 'staff' | 'vendor' | 'unknown';
	userId: string | null;
	vendorId: string | null;
	boothNumber: string | null;
	messageCount: number;
	lastMessageAt: Date;
	/** True when the newest message is theirs — somebody is waiting on a reply. */
	awaitingReply: boolean;
	/** Oldest-first, so the thread reads like a conversation. */
	messages: SmsThreadMessage[];
}

/**
 * Normalise a number to its last 10 digits.
 *
 * Stored numbers are a mess — "(509) 930-8111", "509-930-8111", "+15099308111"
 * all refer to one person, and threading on the raw string would split them
 * into three conversations. Shorter values (short codes, test data) fall back
 * to the trimmed original so they still thread with themselves.
 */
function threadKey(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	return digits.length >= 10 ? digits.slice(-10) : phone.trim();
}

/**
 * Recent SMS conversations, newest activity first.
 *
 * Reads a window of the log and groups it, rather than paging per thread: at
 * TeamTime's volume one query beats N+1, and a thread that has gone quiet long
 * enough to fall out of the window is history, not a live conversation.
 */
export async function listSmsThreads(
	opts: { messageWindow?: number; threadLimit?: number } = {}
): Promise<SmsThread[]> {
	const messageWindow = opts.messageWindow ?? DEFAULT_MESSAGE_WINDOW;
	const threadLimit = opts.threadLimit ?? DEFAULT_THREAD_LIMIT;

	// Two joins onto users: one for the counterparty, one for the sender.
	const counterparty = alias(users, 'counterparty_user');
	const sender = alias(users, 'sender_user');

	let rows;
	try {
		rows = await db
			.select({
				id: smsLogs.id,
				direction: smsLogs.direction,
				status: smsLogs.status,
				body: smsLogs.body,
				fromNumber: smsLogs.fromNumber,
				toNumber: smsLogs.toNumber,
				createdAt: smsLogs.createdAt,
				errorMessage: smsLogs.errorMessage,
				userId: smsLogs.userId,
				counterpartyName: counterparty.name,
				vendorId: smsLogs.vendorId,
				vendorName: vendors.displayName,
				boothNumber: vendors.boothNumber,
				sentByName: sender.name
			})
			.from(smsLogs)
			.leftJoin(counterparty, eq(counterparty.id, smsLogs.userId))
			.leftJoin(vendors, eq(vendors.id, smsLogs.vendorId))
			.leftJoin(sender, eq(sender.id, smsLogs.sentByUserId))
			.orderBy(desc(smsLogs.createdAt))
			.limit(messageWindow);
	} catch (err) {
		log.error({ error: err }, 'Failed to load SMS logs for threading');
		return [];
	}

	const threads = new Map<string, SmsThread>();

	// Rows arrive newest-first. The first row seen for a thread is therefore its
	// newest message, which is what decides the display number and reply state.
	for (const row of rows) {
		const isInbound = row.direction === 'inbound';
		const number = isInbound ? row.fromNumber : row.toNumber;
		if (!number) continue;

		const key = threadKey(number);
		let thread = threads.get(key);

		if (!thread) {
			thread = {
				key,
				phone: number,
				counterpartyName: row.vendorName ?? row.counterpartyName ?? null,
				counterpartyKind: row.vendorId ? 'vendor' : row.userId ? 'staff' : 'unknown',
				userId: row.userId,
				vendorId: row.vendorId,
				boothNumber: row.boothNumber,
				messageCount: 0,
				lastMessageAt: row.createdAt,
				awaitingReply: isInbound,
				messages: []
			};
			threads.set(key, thread);
		} else if (!thread.counterpartyName) {
			// An older row may carry the identity a newer one lacks — e.g. the
			// vendor match only started being recorded partway through a thread.
			thread.counterpartyName = row.vendorName ?? row.counterpartyName ?? null;
			if (row.vendorId) {
				thread.counterpartyKind = 'vendor';
				thread.vendorId = row.vendorId;
				thread.boothNumber = row.boothNumber;
			} else if (row.userId) {
				thread.counterpartyKind = 'staff';
				thread.userId = row.userId;
			}
		}

		thread.messageCount++;
		thread.messages.push({
			id: row.id,
			direction: isInbound ? 'inbound' : 'outbound',
			status: row.status,
			body: row.body,
			createdAt: row.createdAt,
			sentByName: row.sentByName,
			errorMessage: row.errorMessage
		});
	}

	for (const thread of threads.values()) {
		// Collected newest-first; flip so the thread reads as a conversation.
		thread.messages.reverse();
	}

	return [...threads.values()]
		.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
		.slice(0, threadLimit);
}
