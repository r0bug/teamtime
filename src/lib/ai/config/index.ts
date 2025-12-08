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
export const MODEL_OPTIONS = {
	anthropic: [
		{ value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fast, Cheap)', costPer1k: 0.00025 },
		{ value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Better)', costPer1k: 0.001 },
		{ value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Smart)', costPer1k: 0.003 }
	],
	openai: [
		{ value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast, Cheap)', costPer1k: 0.00015 },
		{ value: 'gpt-4o', label: 'GPT-4o (Smart)', costPer1k: 0.0025 }
	]
};

// Tone descriptions
export const TONE_DESCRIPTIONS = {
	helpful_parent: 'Warm and supportive, like a helpful parent checking in',
	professional: 'Business-appropriate, clear and efficient',
	casual: 'Friendly and relaxed, conversational tone',
	formal: 'Formal and respectful, official communications'
};
