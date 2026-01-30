// AI Configuration Service
// Provides cached access to tool and context provider configurations from the database

import { db } from '$lib/server/db';
import { aiToolConfig, aiToolKeywords, aiContextConfig, aiContextKeywords } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';
import type { AIAgent, AITool } from '../types';

const log = createLogger('ai:config-service');

// Resolved tool configuration (merged from DB + defaults)
export interface AIToolConfigResolved {
	name: string;
	description: string;
	isEnabled: boolean;
	requiresConfirmation: boolean;
	cooldown: { perUser?: number; global?: number };
	rateLimit: { maxPerHour: number };
	forceKeywords: string[];
	contextKeywords: string[];
}

// Resolved context provider configuration
export interface AIContextProviderConfigResolved {
	providerId: string;
	moduleName: string;
	isEnabled: boolean;
	priority: number;
	customContext: string | null;
	triggerKeywords: string[];
}

// Cache entry with timestamp
interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

class AIConfigService {
	private toolConfigCache: Map<string, CacheEntry<AIToolConfigResolved[]>> = new Map();
	private contextConfigCache: Map<string, CacheEntry<AIContextProviderConfigResolved[]>> = new Map();
	private readonly CACHE_TTL = 30000; // 30 seconds

	/**
	 * Get configuration for a specific tool, merging DB overrides with code defaults
	 */
	async getToolConfig(
		agent: AIAgent,
		toolName: string,
		toolDefinition: AITool
	): Promise<AIToolConfigResolved> {
		const allConfigs = await this.getAllToolConfigs(agent, [toolDefinition]);
		return allConfigs.find(c => c.name === toolName) || this.toolToResolved(toolDefinition, null, [], []);
	}

	/**
	 * Get all tool configurations for an agent
	 */
	async getAllToolConfigs(
		agent: AIAgent,
		toolDefinitions: AITool[]
	): Promise<AIToolConfigResolved[]> {
		const cacheKey = agent;
		const cached = this.toolConfigCache.get(cacheKey);

		// Return cached if still valid
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			// Merge with any new tool definitions that might have been added
			return this.mergeWithDefinitions(cached.data, toolDefinitions);
		}

		try {
			// Fetch DB configurations
			const dbConfigs = await db
				.select()
				.from(aiToolConfig)
				.where(eq(aiToolConfig.agent, agent));

			// Fetch all keywords for this agent
			const dbKeywords = await db
				.select()
				.from(aiToolKeywords)
				.where(and(eq(aiToolKeywords.agent, agent), eq(aiToolKeywords.isActive, true)));

			// Fetch context keywords that might be linked to tools
			const dbContextKeywords = await db
				.select()
				.from(aiContextKeywords)
				.where(and(eq(aiContextKeywords.agent, agent), eq(aiContextKeywords.isActive, true)));

			// Build resolved configs
			const resolved: AIToolConfigResolved[] = toolDefinitions.map(tool => {
				const dbConfig = dbConfigs.find(c => c.toolName === tool.name) ?? null;
				const toolKeywords = dbKeywords
					.filter(k => k.toolName === tool.name)
					.map(k => k.keyword);
				// For context keywords, we'll link them based on tool name patterns later
				return this.toolToResolved(tool, dbConfig, toolKeywords, []);
			});

			// Update cache
			this.toolConfigCache.set(cacheKey, {
				data: resolved,
				timestamp: Date.now()
			});

			return resolved;
		} catch (error) {
			log.error({ error, agent }, 'Failed to fetch tool configs');
			// Return defaults on error
			return toolDefinitions.map(tool => this.toolToResolved(tool, null, [], []));
		}
	}

	/**
	 * Get force keywords for a specific tool
	 */
	async getForceKeywords(agent: AIAgent, toolName: string): Promise<string[]> {
		try {
			const keywords = await db
				.select({ keyword: aiToolKeywords.keyword })
				.from(aiToolKeywords)
				.where(and(
					eq(aiToolKeywords.agent, agent),
					eq(aiToolKeywords.toolName, toolName),
					eq(aiToolKeywords.isActive, true)
				));
			return keywords.map(k => k.keyword);
		} catch (error) {
			log.error({ error, agent, toolName }, 'Failed to fetch force keywords');
			return [];
		}
	}

	/**
	 * Get all force keywords for an agent (tool -> keywords mapping)
	 */
	async getAllForceKeywords(agent: AIAgent): Promise<Map<string, string[]>> {
		try {
			const keywords = await db
				.select()
				.from(aiToolKeywords)
				.where(and(eq(aiToolKeywords.agent, agent), eq(aiToolKeywords.isActive, true)));

			const result = new Map<string, string[]>();
			for (const kw of keywords) {
				const existing = result.get(kw.toolName) || [];
				existing.push(kw.keyword);
				result.set(kw.toolName, existing);
			}
			return result;
		} catch (error) {
			log.error({ error, agent }, 'Failed to fetch all force keywords');
			return new Map();
		}
	}

	/**
	 * Get context provider configuration
	 */
	async getContextConfig(
		agent: AIAgent,
		providerId: string,
		defaultPriority: number,
		defaultModuleName: string
	): Promise<AIContextProviderConfigResolved> {
		const allConfigs = await this.getAllContextConfigs(agent, [{
			providerId,
			priority: defaultPriority,
			moduleName: defaultModuleName
		}]);
		return allConfigs.find(c => c.providerId === providerId) || {
			providerId,
			moduleName: defaultModuleName,
			isEnabled: true,
			priority: defaultPriority,
			customContext: null,
			triggerKeywords: []
		};
	}

	/**
	 * Get all context provider configurations for an agent
	 */
	async getAllContextConfigs(
		agent: AIAgent,
		providerDefaults: { providerId: string; priority: number; moduleName: string }[]
	): Promise<AIContextProviderConfigResolved[]> {
		const cacheKey = `context:${agent}`;
		const cached = this.contextConfigCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.data;
		}

		try {
			const dbConfigs = await db
				.select()
				.from(aiContextConfig)
				.where(eq(aiContextConfig.agent, agent));

			const dbKeywords = await db
				.select()
				.from(aiContextKeywords)
				.where(and(eq(aiContextKeywords.agent, agent), eq(aiContextKeywords.isActive, true)));

			const resolved: AIContextProviderConfigResolved[] = providerDefaults.map(def => {
				const dbConfig = dbConfigs.find(c => c.providerId === def.providerId);
				const keywords = dbKeywords
					.filter(k => k.providerId === def.providerId)
					.map(k => k.keyword);

				return {
					providerId: def.providerId,
					moduleName: def.moduleName,
					isEnabled: dbConfig?.isEnabled ?? true,
					priority: dbConfig?.priorityOverride ?? def.priority,
					customContext: dbConfig?.customContext ?? null,
					triggerKeywords: keywords
				};
			});

			this.contextConfigCache.set(cacheKey, {
				data: resolved,
				timestamp: Date.now()
			});

			return resolved;
		} catch (error) {
			log.error({ error, agent }, 'Failed to fetch context configs');
			return providerDefaults.map(def => ({
				providerId: def.providerId,
				moduleName: def.moduleName,
				isEnabled: true,
				priority: def.priority,
				customContext: null,
				triggerKeywords: []
			}));
		}
	}

	/**
	 * Get trigger keywords for context injection
	 */
	async getContextTriggerKeywords(agent: AIAgent): Promise<Map<string, string[]>> {
		try {
			const keywords = await db
				.select()
				.from(aiContextKeywords)
				.where(and(eq(aiContextKeywords.agent, agent), eq(aiContextKeywords.isActive, true)));

			const result = new Map<string, string[]>();
			for (const kw of keywords) {
				const existing = result.get(kw.providerId) || [];
				existing.push(kw.keyword);
				result.set(kw.providerId, existing);
			}
			return result;
		} catch (error) {
			log.error({ error, agent }, 'Failed to fetch context trigger keywords');
			return new Map();
		}
	}

	/**
	 * Check if a message matches any force keywords for tools
	 * Returns the tool name to force, or null if no match
	 */
	async findForcedTool(agent: AIAgent, message: string): Promise<string | null> {
		const keywordMap = await this.getAllForceKeywords(agent);
		const lowerMessage = message.toLowerCase();

		for (const [toolName, keywords] of keywordMap) {
			for (const keyword of keywords) {
				if (lowerMessage.includes(keyword.toLowerCase())) {
					log.debug({ toolName, keyword }, 'Force keyword matched');
					return toolName;
				}
			}
		}
		return null;
	}

	/**
	 * Check if a message matches any context trigger keywords
	 * Returns list of provider IDs to inject
	 */
	async findTriggeredContextProviders(agent: AIAgent, message: string): Promise<string[]> {
		const keywordMap = await this.getContextTriggerKeywords(agent);
		const lowerMessage = message.toLowerCase();
		const triggered: string[] = [];

		for (const [providerId, keywords] of keywordMap) {
			for (const keyword of keywords) {
				if (lowerMessage.includes(keyword.toLowerCase())) {
					if (!triggered.includes(providerId)) {
						triggered.push(providerId);
						log.debug({ providerId, keyword }, 'Context trigger keyword matched');
					}
					break;
				}
			}
		}
		return triggered;
	}

	/**
	 * Invalidate all caches - call after config updates
	 */
	invalidateCache(): void {
		this.toolConfigCache.clear();
		this.contextConfigCache.clear();
		log.info('AI config cache invalidated');
	}

	/**
	 * Convert a tool definition + DB config to resolved config
	 */
	private toolToResolved(
		tool: AITool,
		dbConfig: typeof aiToolConfig.$inferSelect | null,
		forceKeywords: string[],
		contextKeywords: string[]
	): AIToolConfigResolved {
		return {
			name: tool.name,
			description: tool.description,
			isEnabled: dbConfig?.isEnabled ?? true,
			requiresConfirmation: dbConfig?.requiresConfirmation ?? tool.requiresConfirmation ?? false,
			cooldown: {
				perUser: dbConfig?.cooldownPerUserMinutes ?? tool.cooldown?.perUser,
				global: dbConfig?.cooldownGlobalMinutes ?? tool.cooldown?.global
			},
			rateLimit: {
				maxPerHour: dbConfig?.rateLimitMaxPerHour ?? tool.rateLimit?.maxPerHour ?? 100
			},
			forceKeywords,
			contextKeywords
		};
	}

	/**
	 * Merge cached data with potentially new tool definitions
	 */
	private mergeWithDefinitions(
		cached: AIToolConfigResolved[],
		definitions: AITool[]
	): AIToolConfigResolved[] {
		// Find any new tools not in cache
		const cachedNames = new Set(cached.map(c => c.name));
		const newTools = definitions.filter(d => !cachedNames.has(d.name));

		if (newTools.length === 0) {
			return cached;
		}

		// Add new tools with default config
		return [
			...cached,
			...newTools.map(tool => this.toolToResolved(tool, null, [], []))
		];
	}
}

// Export singleton instance
export const aiConfigService = new AIConfigService();
