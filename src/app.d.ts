import type { User } from '$lib/server/db/schema';
import type { UserPermissions } from '$lib/server/auth/permissions';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: import('lucia').Session | null;
			userPermissions: UserPermissions | null;
		}

		interface Error {
			message: string;
			code?: string;
		}

		interface PageData {
			user?: User | null;
		}

		interface Platform {}
	}
}

export {};
