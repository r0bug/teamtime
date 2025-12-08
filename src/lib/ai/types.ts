// AI System Types for TeamTime "Shackled Mentats"

// Agent identifiers
export type AIAgent = 'office_manager' | 'revenue_optimizer' | 'architect';

// LLM Providers
export type AIProvider = 'anthropic' | 'openai';

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
}

// LLM Provider interface
export interface LLMProvider {
	name: AIProvider;

	complete: (request: LLMRequest) => Promise<LLMResponse>;
	estimateCost: (inputTokens: number, outputTokens: number, model: string) => number;
}

export interface LLMRequest {
	model: string;
	systemPrompt: string;
	userPrompt: string;
	tools?: AITool[];
	maxTokens?: number;
	temperature?: number;
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
}
