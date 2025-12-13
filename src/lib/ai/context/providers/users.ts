// Users Context Provider - Staff roster and roles
import { db, users } from '$lib/server/db';
import { eq, and, inArray, or } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';
import { getCurrentUserId } from './user-permissions';
import { visibilityService } from '$lib/server/services/visibility-service';

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
	description: 'Active users and their roles with IDs for tool usage',
	priority: 15, // High priority - needed for most user-related actions
	agents: ['office_manager', 'revenue_optimizer'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<UsersData> {
		// Get visibility filter for users
		const currentUserId = getCurrentUserId();
		let visibleUserIds: string[] | null = null;

		if (currentUserId) {
			const filter = await visibilityService.getVisibilityFilter(currentUserId, 'users');
			if (!filter.includeAll) {
				visibleUserIds = await visibilityService.getVisibleUserIds(currentUserId, 'users');
			}
		}

		// Build query conditions
		const conditions = [eq(users.isActive, true)];

		if (visibleUserIds !== null) {
			// Add visibility filter - always include self
			const userIds = visibleUserIds.length > 0 ? visibleUserIds : [];
			if (currentUserId) {
				conditions.push(
					or(
						eq(users.id, currentUserId),
						userIds.length > 0 ? inArray(users.id, userIds) : eq(users.id, currentUserId)
					)!
				);
			} else if (userIds.length > 0) {
				conditions.push(inArray(users.id, userIds));
			}
		}

		const activeUsers = await db
			.select({
				id: users.id,
				name: users.name,
				role: users.role,
				email: users.email
			})
			.from(users)
			.where(and(...conditions))
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
		// UUIDs and emails add more tokens per user
		return 80 + context.roster.length * 40;
	},

	formatForPrompt(context: UsersData): string {
		const roleList = Object.entries(context.summary.byRole)
			.map(([role, count]) => `${count} ${role}(s)`)
			.join(', ');

		const lines: string[] = [
			'## Staff Roster',
			`Total: ${context.summary.totalActive} active users (${roleList})`,
			'',
			'**IMPORTANT: When using tools like send_message, you MUST use the user_id (UUID), not the name.**',
			''
		];

		// Group by role
		const byRole: Record<string, { name: string; userId: string; email: string }[]> = {};
		for (const u of context.roster) {
			if (!byRole[u.role]) byRole[u.role] = [];
			byRole[u.role].push({ name: u.name, userId: u.userId, email: u.email });
		}

		for (const [role, members] of Object.entries(byRole)) {
			lines.push(`### ${role.charAt(0).toUpperCase() + role.slice(1)}s:`);
			for (const m of members) {
				lines.push(`- **${m.name}** (user_id: \`${m.userId}\`, email: ${m.email})`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}
};
