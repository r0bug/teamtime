// Create Policy Tool - Allows Revenue Optimizer to create policy notes that guide Office Manager
import { db, aiPolicyNotes, users, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';

interface CreatePolicyParams {
	scope: 'global' | 'location' | 'role';
	locationId?: string;
	targetRole?: 'admin' | 'user' | 'viewer';
	content: string;
	priority?: number; // 1-100, higher = more important
}

interface CreatePolicyResult {
	success: boolean;
	policyId?: string;
	scopeTarget?: string;
	error?: string;
}

export const createPolicyTool: AITool<CreatePolicyParams, CreatePolicyResult> = {
	name: 'create_policy',
	description: 'Create a policy note that will guide the Office Manager\'s behavior. Use this to establish guidelines, rules, or recommendations that should be followed consistently.',
	agent: 'revenue_optimizer',
	parameters: {
		type: 'object',
		properties: {
			scope: {
				type: 'string',
				enum: ['global', 'location', 'role'],
				description: 'The scope of this policy - applies globally, to a location, or to a role'
			},
			locationId: {
				type: 'string',
				description: 'Location ID if scope is "location"'
			},
			targetRole: {
				type: 'string',
				enum: ['admin', 'user', 'viewer'],
				description: 'Target role if scope is "role"'
			},
			content: {
				type: 'string',
				description: 'The policy content - be clear and actionable'
			},
			priority: {
				type: 'number',
				description: 'Priority 1-100 (default 50). Higher = more important to follow'
			}
		},
		required: ['scope', 'content']
	},

	requiresApproval: false,
	cooldown: {
		perUser: 0, // No per-user cooldown for policies
		global: 5 // 5 min between policy creations
	},
	rateLimit: {
		maxPerHour: 10 // Limit policy creation to prevent spam
	},

	validate(params: CreatePolicyParams) {
		if (!params.scope) {
			return { valid: false, error: 'Scope is required' };
		}
		if (params.scope === 'location' && !params.locationId) {
			return { valid: false, error: 'locationId is required when scope is "location"' };
		}
		if (params.scope === 'role' && !params.targetRole) {
			return { valid: false, error: 'targetRole is required when scope is "role"' };
		}
		if (!params.content || params.content.trim().length < 10) {
			return { valid: false, error: 'Content must be at least 10 characters' };
		}
		if (params.content.length > 1000) {
			return { valid: false, error: 'Content too long (max 1000 chars)' };
		}
		if (params.priority !== undefined && (params.priority < 1 || params.priority > 100)) {
			return { valid: false, error: 'Priority must be between 1 and 100' };
		}
		return { valid: true };
	},

	async execute(params: CreatePolicyParams, context: ToolExecutionContext): Promise<CreatePolicyResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: `Dry run - would create ${params.scope} policy with priority ${params.priority ?? 50}`
			};
		}

		try {
			let scopeTarget = '';

			// Validate scope targets exist
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

			if (params.scope === 'role' && params.targetRole) {
				scopeTarget = `${params.targetRole} role`;
			}

			if (params.scope === 'global') {
				scopeTarget = 'organization';
			}

			// Get first admin as the creator (since this is AI-generated)
			const admins = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			const createdById = admins.length > 0 ? admins[0].id : null;

			const [policy] = await db
				.insert(aiPolicyNotes)
				.values({
					scope: params.scope,
					locationId: params.scope === 'location' ? params.locationId : null,
					targetRole: params.scope === 'role' ? params.targetRole : null,
					content: params.content.trim(),
					priority: params.priority ?? 50,
					createdByUserId: createdById,
					isActive: true
				})
				.returning({ id: aiPolicyNotes.id });

			return {
				success: true,
				policyId: policy.id,
				scopeTarget
			};
		} catch (error) {
			console.error('[AI Tool] create_policy error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: CreatePolicyResult): string {
		if (result.success && result.policyId) {
			return `Policy created for ${result.scopeTarget}`;
		}
		if (result.success) {
			return result.error || 'Policy operation completed';
		}
		return `Failed to create policy: ${result.error}`;
	}
};
