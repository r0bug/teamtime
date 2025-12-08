// Users Context Provider - Staff roster and roles
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';

interface UsersData {
	roster: {
		userId: string;
		name: string;
		role: string;
		email: string;
	}[];
	summary: {
		totalActive: number;
		byRole: Record<string, number>;
	};
}

export const usersProvider: AIContextProvider<UsersData> = {
	moduleId: 'users',
	moduleName: 'Staff Roster',
	description: 'Active users and their roles',
	priority: 50, // Lower priority - less frequently needed
	agents: ['office_manager', 'revenue_optimizer'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<UsersData> {
		const activeUsers = await db
			.select({
				id: users.id,
				name: users.name,
				role: users.role,
				email: users.email
			})
			.from(users)
			.where(eq(users.isActive, true))
			.orderBy(users.name);

		const byRole: Record<string, number> = {};
		for (const u of activeUsers) {
			byRole[u.role] = (byRole[u.role] || 0) + 1;
		}

		return {
			roster: activeUsers.map(u => ({
				userId: u.id,
				name: u.name,
				role: u.role,
				email: u.email
			})),
			summary: {
				totalActive: activeUsers.length,
				byRole
			}
		};
	},

	estimateTokens(context: UsersData): number {
		return 50 + context.roster.length * 15;
	},

	formatForPrompt(context: UsersData): string {
		const roleList = Object.entries(context.summary.byRole)
			.map(([role, count]) => `${count} ${role}(s)`)
			.join(', ');

		const lines: string[] = [
			'## Staff Roster',
			`Total: ${context.summary.totalActive} active users (${roleList})`,
			''
		];

		// Group by role
		const byRole: Record<string, { name: string; userId: string }[]> = {};
		for (const u of context.roster) {
			if (!byRole[u.role]) byRole[u.role] = [];
			byRole[u.role].push({ name: u.name, userId: u.userId });
		}

		for (const [role, members] of Object.entries(byRole)) {
			lines.push(`### ${role.charAt(0).toUpperCase() + role.slice(1)}s:`);
			for (const m of members) {
				lines.push(`- ${m.name}`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}
};
