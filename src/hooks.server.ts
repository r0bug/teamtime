import { error, type Handle } from '@sveltejs/kit';
import { lucia } from '$lib/server/auth';
import { db, users, userExtraRoles } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserPermissions } from '$lib/server/auth/permissions';
import { applyImpersonationClamp, vendorOnlyPermissions } from '$lib/server/auth/impersonation';
import { dev } from '$app/environment';
import { createLogger } from '$lib/server/logger';

/**
 * Security headers to prevent common web vulnerabilities
 */
const securityHeaders: Record<string, string> = {
	// Prevent clickjacking attacks
	'X-Frame-Options': 'SAMEORIGIN',

	// Prevent MIME type sniffing
	'X-Content-Type-Options': 'nosniff',

	// XSS protection (legacy browsers)
	'X-XSS-Protection': '1; mode=block',

	// Referrer policy - send origin only for cross-origin requests
	'Referrer-Policy': 'strict-origin-when-cross-origin',

	// Permissions policy - disable potentially dangerous features
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()'
};

// Content Security Policy - prevents XSS and data injection attacks
// Note: 'unsafe-inline' is needed for Svelte's style handling; consider using nonces in production
const cspDirectives = [
	"default-src 'self'",
	// Scripts: self + inline for Svelte + eval for dev mode HMR
	dev
		? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
		: "script-src 'self' 'unsafe-inline'",
	// Styles: self + inline for Svelte + Google Fonts
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	// Images: self + data URIs + blob for photo uploads + external services
	"img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com",
	// Fonts: self + Google Fonts
	"font-src 'self' https://fonts.gstatic.com",
	// Connect: self + API endpoints + external services
	"connect-src 'self' https://*.googleapis.com wss://*.googleapis.com",
	// Form actions: self only
	"form-action 'self'",
	// Frame ancestors: same origin only (clickjacking protection)
	"frame-ancestors 'self'",
	// Base URI: self only
	"base-uri 'self'",
	// Object sources: none (no Flash/plugins)
	"object-src 'none'",
	// Upgrade insecure requests in production
	...(dev ? [] : ['upgrade-insecure-requests'])
];

const log = createLogger('http');

export const handle: Handle = async ({ event, resolve }) => {
	const requestStart = Date.now();
	const sessionId = event.cookies.get(lucia.sessionCookieName);

	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		event.locals.userPermissions = null;
		return addSecurityHeaders(await resolve(event));
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

		// Deactivated users must not retain access via existing sessions
		if (fullUser && !fullUser.isActive) {
			await lucia.invalidateSession(session!.id);
			const sessionCookie = lucia.createBlankSessionCookie();
			event.cookies.set(sessionCookie.name, sessionCookie.value, {
				path: '.',
				...sessionCookie.attributes
			});
			event.locals.user = null;
			event.locals.session = null;
			event.locals.userPermissions = null;
			return addSecurityHeaders(await resolve(event));
		}

		// An impersonated session — "staff acting as a vendor", minted by
		// /api/app/impersonate-vendor — is DE-PRIVILEGED here rather than trusted from
		// the users row. That endpoint mints a session for `vendors.userId`, and some
		// vendor accounts are linked to staff or admin logins (Storlie's Relics ->
		// john@yakimafinds.com is an admin), so without this clamp any manager could
		// impersonate such a vendor and receive a full admin session.
		//
		// The clamp lives here, not in the endpoint: refusing to impersonate an admin
		// would break the supported case where the owner holds the house vendor
		// accounts. Privilege is a property of the SESSION, not the user — the same
		// person is legitimately an admin in their browser and vendor-only in a
		// label-app impersonation session at the same moment.
		const isImpersonated = !!session?.contextVendorId;

		if (fullUser) {
			const extraRoleRows = await db
				.select({ role: userExtraRoles.role })
				.from(userExtraRoles)
				.where(eq(userExtraRoles.userId, fullUser.id));
			event.locals.user = applyImpersonationClamp(
				fullUser,
				extraRoleRows.map((r) => r.role),
				isImpersonated
			);
		} else {
			event.locals.user = null;
		}

		// Load user permissions for granular access control
		if (fullUser && isImpersonated) {
			event.locals.userPermissions = vendorOnlyPermissions();
		} else if (fullUser) {
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

	// Hard deny: an impersonated session may never reach an admin surface, whatever the
	// underlying user's role. The identity clamp above is not sufficient on its own —
	// several admin pages gate only on "is anyone signed in" and never check a role, so
	// there is no gate there for the clamp to fail. Verified: an impersonated session
	// for Storlie's Relics (linked to an admin login) loaded /admin/vendors with a 200
	// with the clamp alone. This is the backstop that does not depend on any individual
	// route remembering to check.
	if (event.locals.session?.contextVendorId) {
		const p = event.url.pathname;
		if (p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/')) {
			log.warn(
				{ path: p, userId: event.locals.user?.id, vendorId: event.locals.session.contextVendorId },
				'Blocked admin access from an impersonated vendor session'
			);
			throw error(403, 'Not available while acting as a vendor');
		}
	}

	const response = addSecurityHeaders(await resolve(event));

	// Request logging (skip static assets and HMR in dev)
	const path = event.url.pathname;
	if (!path.startsWith('/_app/') && !path.startsWith('/@') && !path.includes('.')) {
		const duration = Date.now() - requestStart;
		log.info({
			method: event.request.method,
			path,
			status: response.status,
			duration,
			userId: event.locals.user?.id
		}, `${event.request.method} ${path} ${response.status} ${duration}ms`);
	}

	return response;
};

/**
 * Add security headers to the response
 */
function addSecurityHeaders(response: Response): Response {
	const newHeaders = new Headers(response.headers);

	// Add all security headers
	for (const [key, value] of Object.entries(securityHeaders)) {
		newHeaders.set(key, value);
	}

	// Add Content-Security-Policy
	newHeaders.set('Content-Security-Policy', cspDirectives.join('; '));

	// Add HSTS header for HTTPS connections (only in production)
	if (!dev) {
		// max-age=1 year, include subdomains, allow preload list
		newHeaders.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains; preload'
		);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders
	});
}
