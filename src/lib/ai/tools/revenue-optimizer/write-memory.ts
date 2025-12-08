// Write Memory Tool - Allows Revenue Optimizer to store observations and patterns
import { db, aiMemory, users, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';

interface WriteMemoryParams {
	scope: 'user' | 'location' | 'global';
	userId?: string;
	locationId?: string;
	memoryType: 'pattern' | 'preference' | 'observation' | 'performance';
	content: string;
	confidence?: number; // 0.00-1.00
}

interface WriteMemoryResult {
	success: boolean;
	memoryId?: string;
	scopeTarget?: string;
	error?: string;
}

export const writeMemoryTool: AITool<WriteMemoryParams, WriteMemoryResult> = {
	name: 'write_memory',
	description: 'Store an observation, pattern, or insight for future reference. Use this to remember things about users, locations, or the organization that will help guide future decisions.',
	agent: 'revenue_optimizer',
	parameters: {
		type: 'object',
		properties: {
			scope: {
				type: 'string',
				enum: ['user', 'location', 'global'],
				description: 'The scope of this memory - user-specific, location-specific, or global'
			},
			userId: {
				type: 'string',
				description: 'User ID if scope is "user"'
			},
			locationId: {
				type: 'string',
				description: 'Location ID if scope is "location"'
			},
			memoryType: {
				type: 'string',
				enum: ['pattern', 'preference', 'observation', 'performance'],
				description: 'Type of memory: pattern (recurring behavior), preference (how they like things), observation (one-time note), performance (work quality/speed)'
			},
			content: {
				type: 'string',
				description: 'The memory content - be specific and actionable'
			},
			confidence: {
				type: 'number',
				description: 'Confidence level 0.0-1.0 (default 0.5). Higher = more certain this is accurate'
			}
		},
		required: ['scope', 'memoryType', 'content']
	},

	requiresApproval: false,
	cooldown: {
		perUser: 5, // Can write about same user every 5 min
		global: 1 // Can write memories frequently
	},
	rateLimit: {
		maxPerHour: 50 // Revenue Optimizer can write many memories per run
	},

	validate(params: WriteMemoryParams) {
		if (!params.scope) {
			return { valid: false, error: 'Scope is required' };
		}
		if (params.scope === 'user' && !params.userId) {
			return { valid: false, error: 'userId is required when scope is "user"' };
		}
		if (params.scope === 'location' && !params.locationId) {
			return { valid: false, error: 'locationId is required when scope is "location"' };
		}
		if (!params.memoryType) {
			return { valid: false, error: 'memoryType is required' };
		}
		if (!params.content || params.content.trim().length < 10) {
			return { valid: false, error: 'Content must be at least 10 characters' };
		}
		if (params.content.length > 2000) {
			return { valid: false, error: 'Content too long (max 2000 chars)' };
		}
		if (params.confidence !== undefined && (params.confidence < 0 || params.confidence > 1)) {
			return { valid: false, error: 'Confidence must be between 0 and 1' };
		}
		return { valid: true };
	},

	async execute(params: WriteMemoryParams, context: ToolExecutionContext): Promise<WriteMemoryResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: `Dry run - would write ${params.memoryType} memory with scope ${params.scope}`
			};
		}

		try {
			let scopeTarget = '';

			// Validate scope targets exist
			if (params.scope === 'user' && params.userId) {
				const user = await db
					.select({ name: users.name })
					.from(users)
					.where(eq(users.id, params.userId))
					.limit(1);
				if (user.length === 0) {
					return { success: false, error: 'User not found' };
				}
				scopeTarget = user[0].name;
			}

			if (params.scope === 'location' && params.locationId) {
				const location = await db
					.select({ name: locations.name })
					.from(locations)
					.where(eq(locations.id, params.locationId))
					.limit(1);
				if (location.length === 0) {
					return { success: false, error: 'Location not found' };
				}
				scopeTarget = location[0].name;
			}

			if (params.scope === 'global') {
				scopeTarget = 'organization';
			}

			const [memory] = await db
				.insert(aiMemory)
				.values({
					scope: params.scope,
					userId: params.scope === 'user' ? params.userId : null,
					locationId: params.scope === 'location' ? params.locationId : null,
					memoryType: params.memoryType,
					content: params.content.trim(),
					confidence: String(params.confidence ?? 0.5),
					source: 'revenue_optimizer'
				})
				.returning({ id: aiMemory.id });

			return {
				success: true,
				memoryId: memory.id,
				scopeTarget
			};
		} catch (error) {
			console.error('[AI Tool] write_memory error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: WriteMemoryResult): string {
		if (result.success && result.memoryId) {
			return `Memory stored for ${result.scopeTarget}`;
		}
		if (result.success) {
			return result.error || 'Memory operation completed';
		}
		return `Failed to write memory: ${result.error}`;
	}
};
