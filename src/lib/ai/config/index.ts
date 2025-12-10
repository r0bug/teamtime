// AI Configuration management
export * from './keys';

// Default instructions for each agent
export const DEFAULT_INSTRUCTIONS = {
	office_manager: `Focus on staff wellbeing and operational smoothness.
Be proactive about helping new users learn the system.
When things are quiet, suggest workflow improvements to admins.`,

	revenue_optimizer: `Analyze patterns and write observations that help the Office Manager.
Focus on adoption metrics and system usage during early rollout.
Send daily summaries to admins about system activity.`
};

// Model options per provider
export const MODEL_OPTIONS: Record<string, { value: string; label: string; costPer1k: number }[]> = {
	anthropic: [
		// Claude 4 Series (Latest - 2025)
		{ value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Most Capable)', costPer1k: 0.015 },
		{ value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Balanced)', costPer1k: 0.003 },
		// Claude 3.5 Series
		{ value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Smart)', costPer1k: 0.003 },
		{ value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast)', costPer1k: 0.001 },
		// Claude 3 Series
		{ value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Legacy)', costPer1k: 0.015 },
		{ value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet (Legacy)', costPer1k: 0.003 },
		{ value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fast, Cheap)', costPer1k: 0.00025 }
	],
	openai: [
		// GPT-4o Series (Latest)
		{ value: 'gpt-4o', label: 'GPT-4o (Flagship)', costPer1k: 0.0025 },
		{ value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast, Cheap)', costPer1k: 0.00015 },
		{ value: 'gpt-4o-2024-11-20', label: 'GPT-4o (Nov 2024)', costPer1k: 0.0025 },
		{ value: 'gpt-4o-2024-08-06', label: 'GPT-4o (Aug 2024)', costPer1k: 0.0025 },
		// o1 Reasoning Series
		{ value: 'o1', label: 'o1 (Advanced Reasoning)', costPer1k: 0.015 },
		{ value: 'o1-mini', label: 'o1 Mini (Fast Reasoning)', costPer1k: 0.003 },
		{ value: 'o1-preview', label: 'o1 Preview (Reasoning)', costPer1k: 0.015 },
		// o3 Series (Latest Reasoning - 2025)
		{ value: 'o3-mini', label: 'o3 Mini (Latest Reasoning)', costPer1k: 0.0011 },
		// GPT-4 Turbo
		{ value: 'gpt-4-turbo', label: 'GPT-4 Turbo', costPer1k: 0.01 },
		{ value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo Preview', costPer1k: 0.01 },
		// GPT-4 Legacy
		{ value: 'gpt-4', label: 'GPT-4 (Legacy)', costPer1k: 0.03 },
		{ value: 'gpt-4-32k', label: 'GPT-4 32K (Legacy)', costPer1k: 0.06 },
		// GPT-3.5 Turbo
		{ value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Budget)', costPer1k: 0.0005 },
		{ value: 'gpt-3.5-turbo-16k', label: 'GPT-3.5 Turbo 16K', costPer1k: 0.001 }
	],
	segmind: [
		// Claude models via Segmind
		{ value: 'segmind-claude-4.5-sonnet', label: 'Claude 4.5 Sonnet (via Segmind)', costPer1k: 0.003 },
		{ value: 'segmind-claude-4-sonnet', label: 'Claude 4 Sonnet (via Segmind)', costPer1k: 0.003 },
		{ value: 'segmind-claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (via Segmind)', costPer1k: 0.003 },
		// GPT models via Segmind
		{ value: 'segmind-gpt-5', label: 'GPT-5 (via Segmind)', costPer1k: 0.005 },
		{ value: 'segmind-gpt-5-mini', label: 'GPT-5 Mini (via Segmind)', costPer1k: 0.0003 },
		{ value: 'segmind-gpt-5-nano', label: 'GPT-5 Nano (Fast, via Segmind)', costPer1k: 0.0002 },
		{ value: 'segmind-gpt-4o', label: 'GPT-4o (via Segmind)', costPer1k: 0.0025 },
		{ value: 'segmind-gpt-4-turbo', label: 'GPT-4 Turbo (via Segmind)', costPer1k: 0.01 },
		// Gemini models via Segmind
		{ value: 'segmind-gemini-3-pro', label: 'Gemini 3 Pro (via Segmind)', costPer1k: 0.00125 },
		{ value: 'segmind-gemini-2.5-pro', label: 'Gemini 2.5 Pro (via Segmind)', costPer1k: 0.00125 },
		{ value: 'segmind-gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast, via Segmind)', costPer1k: 0.000075 },
		// DeepSeek models via Segmind
		{ value: 'segmind-deepseek-chat', label: 'DeepSeek Chat (Budget, via Segmind)', costPer1k: 0.00014 },
		{ value: 'segmind-deepseek-r1', label: 'DeepSeek R1 (Reasoning, via Segmind)', costPer1k: 0.00055 },
		// Llama models via Segmind
		{ value: 'segmind-llama-3.1-405b', label: 'Llama 3.1 405B (via Segmind)', costPer1k: 0.003 },
		{ value: 'segmind-llama-3.1-70b', label: 'Llama 3.1 70B (via Segmind)', costPer1k: 0.0009 },
		{ value: 'segmind-llama-3.1-8b', label: 'Llama 3.1 8B (Budget, via Segmind)', costPer1k: 0.0002 },
		// Kimi via Segmind
		{ value: 'segmind-kimi-k2', label: 'Kimi K2 (262K Context, via Segmind)', costPer1k: 0.0006 }
	]
};

// Tone descriptions
export const TONE_DESCRIPTIONS = {
	helpful_parent: 'Warm and supportive, like a helpful parent checking in',
	professional: 'Business-appropriate, clear and efficient',
	casual: 'Friendly and relaxed, conversational tone',
	formal: 'Formal and respectful, official communications'
};
