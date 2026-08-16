import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import { dev } from '$app/environment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new DrizzlePostgreSQLAdapter(db, sessions as any, users as any);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: !dev
		}
	},
	getUserAttributes: (attributes) => {
		return {
			id: attributes.id,
			email: attributes.email,
			username: attributes.username,
			role: attributes.role,
			name: attributes.name,
			phone: attributes.phone,
			isActive: attributes.isActive
		};
	},
	// Exposes session columns on `locals.session`. Only contextVendorId is surfaced:
	// it is what tells hooks.server.ts that this session is an impersonation and must
	// be de-privileged. Nothing else here should be treated as a security signal —
	// deviceFingerprint is client-supplied metadata.
	getSessionAttributes: (attributes) => {
		return {
			contextVendorId: attributes.contextVendorId ?? null
		};
	}
});

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
		DatabaseSessionAttributes: DatabaseSessionAttributes;
	}
}

interface DatabaseSessionAttributes {
	deviceFingerprint?: string | null;
	ipAddress?: string | null;
	userAgent?: string | null;
	lastActive?: Date;
	last2faAt?: Date | null;
	// Optional so the five non-impersonation createSession call sites keep compiling
	// unchanged; the column is nullable and defaults to NULL for ordinary logins.
	contextVendorId?: string | null;
}

interface DatabaseUserAttributes {
	id: string;
	email: string;
	username: string;
	role: 'admin' | 'manager' | 'purchaser' | 'staff';
	userTypeId: string | null;
	name: string;
	phone: string | null;
	isActive: boolean;
	mustChangePassword: boolean;
}

export { lucia as auth };
