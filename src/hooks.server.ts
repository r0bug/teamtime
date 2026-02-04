import type { Handle } from '@sveltejs/kit';
import { lucia } from '$lib/server/auth';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserPermissions } from '$lib/server/auth/permissions';
import { dev } from '$app/environment';

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

export const handle: Handle = async ({ event, resolve }) => {
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

	return addSecurityHeaders(await resolve(event));
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
