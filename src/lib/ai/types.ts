// AI System Types for TeamTime "Shackled Mentats"

// Agent identifiers
export type AIAgent = 'office_manager' | 'revenue_optimizer' | 'architect';

// LLM Providers
export type AIProvider = 'anthropic' | 'openai' | 'segmind' | 'deepseek';

// Tone options
export type AITone = 'helpful_parent' | 'professional' | 'casual' | 'formal';

// Context provider interface - every module exposing data to AI must implement this
export interface AIContextProvider<T = unknown> {
	moduleId: string;
	moduleName: string;
	description: string;
	priority: number; // 1-100, lower = higher priority
	agents: AIAgent[]; // Which agents use this provider

	isEnabled: () => Promise<boolean>;
	getContext: () => Promise<T>;
	estimateTokens: (context: T) => number;
	formatForPrompt: (context: T) => string;
}

// Assembled context from all providers
export interface AssembledContext {
	timestamp: Date;
	agent: AIAgent;
	modules: {
		moduleId: string;
		moduleName: string;
		content: string;
		tokenEstimate: number;
	}[];
	totalTokens: number;
	summary: Record<string, number>;
}

// Tool definition
export interface AITool<TParams = unknown, TResult = unknown> {
	name: string;
	description: string;
	agent: AIAgent;
	parameters: {
		type: 'object';
		properties: Record<string, unknown>;
		required: string[];
	};

	// Safety controls
	requiresApproval: boolean;
	cooldown?: {
		perUser?: number; // minutes
		global?: number; // minutes
	};
	rateLimit?: {
		maxPerHour: number;
	};

	// Chat-specific: requires user confirmation before execution
	requiresConfirmation?: boolean;
	// Generate a human-readable confirmation message for the action
	getConfirmationMessage?: (params: TParams) => string;

	// Execution
	validate: (params: TParams) => { valid: boolean; error?: string };
	execute: (params: TParams, context: ToolExecutionContext) => Promise<TResult>;
	formatResult: (result: TResult) => string;
}

export interface ToolExecutionContext {
	runId: string;
	agent: AIAgent;
	dryRun: boolean;
	config: {
		provider: AIProvider;
		model: string;
	};
	// Optional properties for chat mode
	chatId?: string;
	userId?: string;
}

/**
 * A reasoning block emitted by thinking-mode models (Anthropic extended thinking,
 * DeepSeek V4 Flash, etc). Must be echoed back verbatim on the next request when
 * the assistant turn that produced it had a tool_use, or the API 400s.
 */
export interface ThinkingBlock {
	type: 'thinking' | 'redacted_thinking';
	thinking?: string;
	signature?: string;
	data?: string;
}

// Streaming event for chat responses
export interface LLMStreamEvent {
	type: 'text' | 'tool_use' | 'thinking' | 'done';
	content?: string;
	toolCall?: { id?: string; name: string; params: Record<string, unknown> };
	thinkingBlock?: ThinkingBlock;
	usage?: { inputTokens: number; outputTokens: number };
}

// LLM Provider interface
export interface LLMProvider {
	name: AIProvider;

	complete: (request: LLMRequest) => Promise<LLMResponse>;
	stream?: (request: LLMRequest) => AsyncGenerator<LLMStreamEvent>;
	estimateCost: (inputTokens: number, outputTokens: number, model: string) => number;
}

/**
 * A single conversation turn. Used when callers want to send a multi-turn
 * conversation to the model instead of a single concatenated user prompt.
 * Anthropic providers preserve role+text; tool_use/tool_result blocks for
 * past turns are flattened into the assistant's text since stable tool_use
 * IDs aren't persisted across turns.
 */
export interface ConversationTurn {
	role: 'user' | 'assistant';
	content: string;
}

export interface LLMRequest {
	model: string;
	systemPrompt: string;
	userPrompt: string;
	/**
	 * Optional structured conversation. When provided, the provider sends
	 * these as a real `messages` array instead of stuffing history into
	 * `userPrompt`. The last entry should be the current user request.
	 */
	messages?: ConversationTurn[];
	tools?: AITool[];
	maxTokens?: number;
	temperature?: number;
	/** Force a specific tool to be called (tool_choice: tool) */
	forcedTool?: string;
}

export interface LLMResponse {
	content: string;
	toolCalls?: {
		name: string;
		params: Record<string, unknown>;
	}[];
	usage: {
		inputTokens: number;
		outputTokens: number;
		costCents?: number; // Provider-reported cost in cents (if available from API)
	};
	finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error';
}

// Run result
export interface AIRunResult {
	runId: string;
	agent: AIAgent;
	startedAt: Date;
	completedAt: Date;
	contextTokens: number;
	actionsLogged: number;
	actionsExecuted: number;
	errors: string[];
	totalCostCents: number;
}

// API Keys config file structure
export interface AIKeysConfig {
	anthropic?: string;
	openai?: string;
	segmind?: string;
	deepseek?: string;
}

// Runtime AI configuration (passed to services)
export interface AIConfig {
	enabled: boolean;
	dryRunMode: boolean;
	provider: AIProvider;
	model: string;
	tone: AITone;
	customInstructions?: string;
}
