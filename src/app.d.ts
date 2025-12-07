import type { User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: import('lucia').Session | null;
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
