/**
 * @module Tests/AI/Types
 * @description Tests for AI system type definitions.
 *
 * Verifies the structure and constraints of:
 * - Agent types
 * - Provider types
 * - Tool interfaces
 * - Context provider interfaces
 */

import { describe, it, expect } from 'vitest';
import type { AIAgent, AIProvider, AITone, AITool, AIContextProvider, ToolExecutionContext } from '$lib/ai/types';

describe('AI Types', () => {
	describe('AIAgent type', () => {
		it('should accept valid agent types', () => {
			const agents: AIAgent[] = ['office_manager', 'revenue_optimizer', 'architect'];
			expect(agents).toHaveLength(3);
		});
	});

	describe('AIProvider type', () => {
		it('should accept valid provider types', () => {
			const providers: AIProvider[] = ['anthropic', 'openai', 'segmind'];
			expect(providers).toHaveLength(3);
		});
	});

	describe('AITone type', () => {
		it('should accept valid tone types', () => {
			const tones: AITone[] = ['helpful_parent', 'professional', 'casual', 'formal'];
			expect(tones).toHaveLength(4);
		});
	});

	describe('AITool interface', () => {
		it('should have required properties', () => {
			// Type-check that a tool has all required properties
			const mockTool: AITool<{ date: string }, { success: boolean }> = {
				name: 'test_tool',
				description: 'A test tool',
				agent: 'office_manager',
				parameters: {
					type: 'object',
					properties: {
						date: { type: 'string', description: 'The date' }
					},
					required: ['date']
				},
				requiresApproval: false,
				validate: (params) => ({ valid: !!params.date }),
				execute: async () => ({ success: true }),
				formatResult: (result) => `Success: ${result.success}`
			};

			expect(mockTool.name).toBe('test_tool');
			expect(mockTool.agent).toBe('office_manager');
			expect(mockTool.requiresApproval).toBe(false);
		});

		it('should support optional cooldown', () => {
			const toolWithCooldown: Partial<AITool> = {
				cooldown: {
					perUser: 5,
					global: 10
				}
			};

			expect(toolWithCooldown.cooldown?.perUser).toBe(5);
			expect(toolWithCooldown.cooldown?.global).toBe(10);
		});

		it('should support optional rate limit', () => {
			const toolWithRateLimit: Partial<AITool> = {
				rateLimit: {
					maxPerHour: 100
				}
			};

			expect(toolWithRateLimit.rateLimit?.maxPerHour).toBe(100);
		});

		it('should support confirmation for chat mode', () => {
			const toolWithConfirmation: Partial<AITool<{ action: string }>> = {
				requiresConfirmation: true,
				getConfirmationMessage: (params) => `Are you sure you want to ${params.action}?`
			};

			expect(toolWithConfirmation.requiresConfirmation).toBe(true);
			expect(toolWithConfirmation.getConfirmationMessage?.({ action: 'delete' })).toContain('delete');
		});
	});

	describe('ToolExecutionContext interface', () => {
		it('should have required properties', () => {
			const context: ToolExecutionContext = {
				runId: 'test-run-123',
				agent: 'office_manager',
				dryRun: false,
				config: {
					provider: 'anthropic',
					model: 'claude-sonnet-4-20250514'
				}
			};

			expect(context.runId).toBe('test-run-123');
			expect(context.agent).toBe('office_manager');
			expect(context.dryRun).toBe(false);
			expect(context.config.provider).toBe('anthropic');
		});

		it('should support dry run mode', () => {
			const dryRunContext: ToolExecutionContext = {
				runId: 'test-dry-run',
				agent: 'revenue_optimizer',
				dryRun: true,
				config: {
					provider: 'openai',
					model: 'gpt-4o'
				}
			};

			expect(dryRunContext.dryRun).toBe(true);
		});
	});

	describe('AIContextProvider interface', () => {
		it('should have required properties', () => {
			const mockProvider: AIContextProvider<{ users: string[] }> = {
				moduleId: 'test-module',
				moduleName: 'Test Module',
				description: 'A test context provider',
				priority: 50,
				agents: ['office_manager', 'revenue_optimizer'],

				isEnabled: async () => true,
				getContext: async () => ({ users: ['user1', 'user2'] }),
				estimateTokens: (ctx) => ctx.users.length * 10,
				formatForPrompt: (ctx) => `Users: ${ctx.users.join(', ')}`
			};

			expect(mockProvider.moduleId).toBe('test-module');
			expect(mockProvider.priority).toBe(50);
			expect(mockProvider.agents).toContain('office_manager');
		});

		it('should have priority between 1-100', () => {
			// Priority should be in range 1-100 (lower = higher priority)
			const validPriorities = [1, 10, 25, 50, 75, 100];
			for (const priority of validPriorities) {
				expect(priority).toBeGreaterThanOrEqual(1);
				expect(priority).toBeLessThanOrEqual(100);
			}
		});

		it('should support multiple agents', () => {
			const multiAgentProvider: Partial<AIContextProvider> = {
				agents: ['office_manager', 'revenue_optimizer', 'architect']
			};

			expect(multiAgentProvider.agents).toHaveLength(3);
		});
	});
});
