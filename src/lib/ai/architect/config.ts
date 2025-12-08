// Architect Configuration Helper
// Manages the multi-model consultation configuration

import { db, architectConfig } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { ArchitectConfig, NewArchitectConfig } from '$lib/server/db/schema';
import type { ModelConfig, DeliberationConfig } from './multi-model';

/**
 * Get the current architect configuration (creates default if none exists)
 */
export async function getArchitectConfig(): Promise<ArchitectConfig> {
	const [existing] = await db.select().from(architectConfig).limit(1);

	if (existing) {
		return existing;
	}

	// Create default config
	const [newConfig] = await db
		.insert(architectConfig)
		.values({})
		.returning();

	return newConfig;
}

/**
 * Update architect configuration
 */
export async function updateArchitectConfig(
	updates: Partial<NewArchitectConfig>
): Promise<ArchitectConfig> {
	const current = await getArchitectConfig();

	const [updated] = await db
		.update(architectConfig)
		.set({
			...updates,
			updatedAt: new Date()
		})
		.where(eq(architectConfig.id, current.id))
		.returning();

	return updated || current;
}

/**
 * Get the model config for quick tier
 */
export function getQuickModelConfig(config: ArchitectConfig): ModelConfig {
	return {
		provider: config.quickProvider,
		model: config.quickModel
	};
}

/**
 * Get the model config for standard tier
 */
export function getStandardModelConfig(config: ArchitectConfig): ModelConfig {
	return {
		provider: config.standardProvider,
		model: config.standardModel
	};
}

/**
 * Get the full deliberation config for deliberate tier
 */
export function getDeliberationConfig(config: ArchitectConfig): DeliberationConfig {
	return {
		primary: {
			provider: config.deliberatePrimaryProvider,
			model: config.deliberatePrimaryModel
		},
		review: {
			provider: config.deliberateReviewProvider,
			model: config.deliberateReviewModel
		},
		synthesizer: {
			provider: config.deliberateSynthProvider,
			model: config.deliberateSynthModel
		}
	};
}

/**
 * Check if multi-model deliberation is enabled for any trigger
 */
export function isDeliberationEnabled(config: ArchitectConfig): boolean {
	return (
		config.triggerOnADRCreation ||
		config.triggerOnPromptGeneration ||
		config.triggerOnSchemaDesign ||
		config.triggerOnExplicitRequest
	);
}

/**
 * Get a human-readable description of enabled triggers
 */
export function getEnabledTriggersDescription(config: ArchitectConfig): string[] {
	const triggers: string[] = [];

	if (config.triggerOnADRCreation) {
		triggers.push('ADR creation');
	}
	if (config.triggerOnPromptGeneration) {
		triggers.push('Prompt generation');
	}
	if (config.triggerOnSchemaDesign) {
		triggers.push('Schema/database design');
	}
	if (config.triggerOnExplicitRequest) {
		triggers.push('Explicit request');
	}

	return triggers;
}

/**
 * Get model display name
 */
export function getModelDisplayName(model: string): string {
	const modelNames: Record<string, string> = {
		'claude-opus-4-20250514': 'Claude Opus 4',
		'claude-sonnet-4-20250514': 'Claude Sonnet 4',
		'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
		'claude-3-opus-20240229': 'Claude 3 Opus',
		'claude-3-haiku-20240307': 'Claude 3 Haiku',
		'gpt-4o': 'GPT-4o',
		'gpt-4-turbo-preview': 'GPT-4 Turbo',
		'gpt-4': 'GPT-4'
	};

	return modelNames[model] || model;
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: string): string {
	const providerNames: Record<string, string> = {
		anthropic: 'Anthropic',
		openai: 'OpenAI'
	};

	return providerNames[provider] || provider;
}

/**
 * Get presentation mode display name
 */
export function getPresentationModeDisplayName(mode: string): string {
	const modeNames: Record<string, string> = {
		synthesized: 'Synthesized (single response)',
		side_by_side: 'Side by Side (show both)',
		primary_with_notes: 'Primary with Review Notes'
	};

	return modeNames[mode] || mode;
}

/**
 * Available model options for each provider
 */
export const MODEL_OPTIONS = {
	anthropic: [
		{ value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
		{ value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
		{ value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
		{ value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
		{ value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
	],
	openai: [
		{ value: 'gpt-4o', label: 'GPT-4o' },
		{ value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
		{ value: 'gpt-4', label: 'GPT-4' }
	]
} as const;

/**
 * Available presentation modes
 */
export const PRESENTATION_MODES = [
	{ value: 'synthesized', label: 'Synthesized', description: 'Single unified response combining all perspectives' },
	{ value: 'side_by_side', label: 'Side by Side', description: 'Show primary and review responses separately' },
	{ value: 'primary_with_notes', label: 'Primary with Notes', description: 'Primary response with review annotations' }
] as const;
