import type { Handle } from '@sveltejs/kit';
import { lucia } from '$lib/server/auth';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserPermissions } from '$lib/server/auth/permissions';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName);

	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		event.locals.userPermissions = null;
		return resolve(event);
	}

	const { session, user } = await lucia.validateSession(sessionId);

	if (session && session.fresh) {
		const sessionCookie = lucia.createSessionCookie(session.id);
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
	}

	if (!session) {
		const sessionCookie = lucia.createBlankSessionCookie();
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
	}

	if (user) {
		const [fullUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
		event.locals.user = fullUser || null;

		// Load user permissions for granular access control
		if (fullUser) {
			try {
				event.locals.userPermissions = await getUserPermissions(fullUser);
			} catch {
				// Permission loading failed - use empty permissions (will fall back to role-based)
				event.locals.userPermissions = {
					userTypeId: null,
					userTypeName: null,
					basedOnRole: null,
					grantedRoutes: new Set(),
					deniedRoutes: new Set(),
					grantedActions: new Map(),
					deniedActions: new Map()
				};
			}
		} else {
			event.locals.userPermissions = null;
		}
	} else {
		event.locals.user = null;
		event.locals.userPermissions = null;
	}

	event.locals.session = session;

	return resolve(event);
};
