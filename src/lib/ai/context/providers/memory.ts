// Memory & Policy Context Provider - Long-term observations and behavior policies
import { db, aiMemory, aiPolicyNotes, users, locations } from '$lib/server/db';
import { eq, and, gte, desc, isNull, or, inArray } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';
import { getCurrentUserId } from './user-permissions';
import { visibilityService } from '$lib/server/services/visibility-service';

interface MemoryData {
	memories: {
		id: string;
		scope: string;
		memoryType: string;
		content: string;
		confidence: number;
		targetName?: string;
	}[];
	policies: {
		id: string;
		scope: string;
		content: string;
		priority: number;
		targetName?: string;
	}[];
	summary: {
		totalMemories: number;
		totalPolicies: number;
	};
}

export const memoryProvider: AIContextProvider<MemoryData> = {
	moduleId: 'memory',
	moduleName: 'AI Memory & Policies',
	description: 'Long-term observations and behavior guidelines',
	priority: 5, // Highest priority - shapes AI behavior
	agents: ['office_manager'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<MemoryData> {
		// Get visibility filter for user-scoped data
		const currentUserId = getCurrentUserId();
		let visibleUserIds: string[] | null = null;

		if (currentUserId) {
			const filter = await visibilityService.getVisibilityFilter(currentUserId, 'users');
			if (!filter.includeAll) {
				visibleUserIds = await visibilityService.getVisibleUserIds(currentUserId, 'users');
			}
		}

		// Get user and location maps for naming
		const activeUsers = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.isActive, true));
		const userMap = new Map(activeUsers.map(u => [u.id, u.name]));

		const activeLocations = await db
			.select({ id: locations.id, name: locations.name })
			.from(locations)
			.where(eq(locations.isActive, true));
		const locationMap = new Map(activeLocations.map(l => [l.id, l.name]));

		// Build memory query conditions
		// User-scoped memories are filtered by visibility, global/location memories are always visible
		const baseCondition = and(
			eq(aiMemory.isActive, true),
			or(
				gte(aiMemory.confidence, '0.6'),
				gte(aiMemory.lastObservedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
			)
		);

		// Get all active memories first
		const allMemories = await db
			.select()
			.from(aiMemory)
			.where(baseCondition)
			.orderBy(desc(aiMemory.confidence))
			.limit(50); // Fetch more, then filter

		// Filter user-scoped memories based on visibility
		const filteredMemories = allMemories.filter(m => {
			// Global and location-scoped memories are always visible
			if (m.scope !== 'user' || !m.userId) return true;

			// If full visibility, show all
			if (visibleUserIds === null) return true;

			// Check if this user's memories are visible
			if (currentUserId && m.userId === currentUserId) return true; // Own memories
			return visibleUserIds.includes(m.userId);
		}).slice(0, 20); // Limit to 20

		const memories = filteredMemories.map(m => ({
			id: m.id,
			scope: m.scope,
			memoryType: m.memoryType,
			content: m.content,
			confidence: parseFloat(m.confidence?.toString() || '0.5'),
			targetName: m.userId ? userMap.get(m.userId) :
				m.locationId ? locationMap.get(m.locationId) : undefined
		}));

		// Get active policies
		const activePolicies = await db
			.select()
			.from(aiPolicyNotes)
			.where(eq(aiPolicyNotes.isActive, true))
			.orderBy(desc(aiPolicyNotes.priority))
			.limit(10);

		const policies = activePolicies.map(p => ({
			id: p.id,
			scope: p.scope,
			content: p.content,
			priority: p.priority,
			targetName: p.locationId ? locationMap.get(p.locationId) :
				p.targetRole ? p.targetRole : undefined
		}));

		return {
			memories,
			policies,
			summary: {
				totalMemories: memories.length,
				totalPolicies: policies.length
			}
		};
	},

	estimateTokens(context: MemoryData): number {
		return 30 +
			context.memories.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0) +
			context.policies.reduce((sum, p) => sum + Math.ceil(p.content.length / 4), 0);
	},

	formatForPrompt(context: MemoryData): string {
		const lines: string[] = [];

		if (context.policies.length > 0) {
			lines.push('## Active Policies (follow these guidelines):');
			for (const p of context.policies) {
				const scope = p.targetName ? ` [${p.targetName}]` : p.scope !== 'global' ? ` [${p.scope}]` : '';
				lines.push(`- ${p.content}${scope}`);
			}
			lines.push('');
		}

		if (context.memories.length > 0) {
			lines.push('## Observations (things I\'ve learned):');
			for (const m of context.memories) {
				const conf = m.confidence >= 0.8 ? '' : ` (${Math.round(m.confidence * 100)}% confident)`;
				const target = m.targetName ? ` about ${m.targetName}` : '';
				lines.push(`- [${m.memoryType}]${target}: ${m.content}${conf}`);
			}
			lines.push('');
		}

		return lines.length > 0 ? lines.join('\n') : '## No active policies or memories\n';
	}
};
