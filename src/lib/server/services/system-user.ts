/**
 * System User Resolution
 *
 * Automated changes still have to name an actor: `time_entries.updated_by`,
 * `demerits.issued_by` and friends are FKs to `users`, so "the system did it"
 * needs a real row.
 *
 * A dedicated `system@teamtime.local` user exists for this (role=admin,
 * is_active=false so it can never log in or be texted). Dev and staging boxes
 * sometimes lack it, so we fall back to the oldest admin rather than failing
 * the whole cron — a slightly wrong actor beats a FK violation that drops the
 * clock-out entirely.
 */

import { db, users } from '$lib/server/db';
import { asc, eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:system-user');

export const SYSTEM_USER_EMAIL = 'system@teamtime.local';

/**
 * The user id to attribute automated changes to, or null when the database has
 * neither a system user nor any admin. Callers that write a FK column must
 * treat null as "cannot attribute" rather than assuming a value.
 */
export async function resolveSystemUserId(): Promise<string | null> {
	try {
		const [systemUser] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, SYSTEM_USER_EMAIL))
			.limit(1);

		if (systemUser) return systemUser.id;

		const [admin] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.role, 'admin'))
			.orderBy(asc(users.createdAt))
			.limit(1);

		if (!admin) {
			log.error('No system user and no admin users exist');
			return null;
		}

		log.warn({ adminId: admin.id }, `${SYSTEM_USER_EMAIL} not found, falling back to oldest admin`);
		return admin.id;
	} catch (err) {
		log.error({ error: err }, 'Failed to resolve system user');
		return null;
	}
}
