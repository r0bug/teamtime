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
	}
});

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
	id: string;
	email: string;
	username: string;
	role: 'manager' | 'purchaser' | 'staff';
	name: string;
	phone: string | null;
	isActive: boolean;
}

export { lucia as auth };
