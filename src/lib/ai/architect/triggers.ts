// Tier Detection for Multi-Model Consultation
// Determines which consultation tier to use based on message content and config

import type { ArchitectConfig } from '$lib/server/db/schema';
import type { ConsultationTier } from './multi-model';

export interface TriggerResult {
	tier: ConsultationTier;
	reason: string;
	triggers: string[];
}

// Patterns that suggest ADR creation
const ADR_PATTERNS = [
	/\b(create|draft|write|document)\b.*\b(adr|architecture decision|decision record)\b/i,
	/\brecord\b.*\b(decision|choice)\b/i,
	/\bdocument.*architecture\b/i,
	/\badr\s*\d+/i
];

// Patterns that suggest prompt generation
const PROMPT_PATTERNS = [
	/\b(create|generate|write|draft)\b.*\b(prompt|implementation prompt|claude code prompt)\b/i,
	/\bprompt\s+for\s+(implementing|building|creating)\b/i,
	/\bgenerate\b.*\b(task|implementation)\b/i,
	/\bwrite.*code.*prompt\b/i
];

// Patterns that suggest schema/database design
const SCHEMA_PATTERNS = [
	/\b(design|create|modify|update|change)\b.*\b(schema|database|table|model)\b/i,
	/\bdatabase\s+(design|architecture|structure)\b/i,
	/\bschema\s+(changes?|migration|design)\b/i,
	/\b(add|remove|modify)\b.*\b(column|field|table|index|constraint)\b/i,
	/\bentity\s+relationship\b/i,
	/\bdata\s+model\b/i,
	/\bnormalization\b/i,
	/\bforeign\s+key\b/i
];

// Patterns for explicit deliberation request
const EXPLICIT_DELIBERATE_PATTERNS = [
	/\bdeliberate\b/i,
	/\bconsult\s+(multiple|both)\s+models?\b/i,
	/\bget\s+(multiple|different)\s+(perspectives?|opinions?)\b/i,
	/\bthink\s+(carefully|deeply|thoroughly)\b/i,
	/\bmulti[- ]?model\b/i,
	/\bcross[- ]?reference\b/i,
	/\bsecond\s+opinion\b/i
];

// Patterns that suggest quick/simple questions
const QUICK_PATTERNS = [
	/^(what|how|why|when|where|can|is|are|do|does)\s+.{0,50}\?$/i,
	/\b(explain|clarify|define)\b.*\b(term|concept|meaning)\b/i,
	/\bquick\s+question\b/i,
	/\bjust\s+(wondering|curious)\b/i,
	/\bbrief(ly)?\b/i
];

// Complexity indicators that push toward standard/deliberate
const COMPLEXITY_INDICATORS = [
	/\b(trade[- ]?off|pros?\s+and\s+cons?)\b/i,
	/\b(compare|contrast|versus|vs\.?)\b/i,
	/\b(best\s+practice|pattern|approach)\b/i,
	/\b(architecture|system\s+design|infrastructure)\b/i,
	/\b(scalab|performan|secur|reliab)/i,
	/\b(migrate|refactor|restructure)\b/i,
	/\b(integrate|integration)\b/i,
	/\b(breaking\s+change|backward\s+compat)/i
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
	return patterns.some(pattern => pattern.test(text));
}

function countMatches(text: string, patterns: RegExp[]): number {
	return patterns.filter(pattern => pattern.test(text)).length;
}

/**
 * Detect which consultation tier to use based on message content and config
 */
export function detectConsultationTier(
	message: string,
	config: ArchitectConfig
): TriggerResult {
	const triggers: string[] = [];

	// Check for explicit deliberation request first
	if (config.triggerOnExplicitRequest && matchesAny(message, EXPLICIT_DELIBERATE_PATTERNS)) {
		triggers.push('explicit_deliberation_request');
		return {
			tier: 'deliberate',
			reason: 'User explicitly requested multi-model deliberation',
			triggers
		};
	}

	// Check for ADR creation triggers
	if (config.triggerOnADRCreation && matchesAny(message, ADR_PATTERNS)) {
		triggers.push('adr_creation');
	}

	// Check for prompt generation triggers
	if (config.triggerOnPromptGeneration && matchesAny(message, PROMPT_PATTERNS)) {
		triggers.push('prompt_generation');
	}

	// Check for schema design triggers
	if (config.triggerOnSchemaDesign && matchesAny(message, SCHEMA_PATTERNS)) {
		triggers.push('schema_design');
	}

	// If any deliberation triggers matched, use deliberate tier
	if (triggers.length > 0) {
		const triggerDescriptions = triggers.map(t => {
			switch (t) {
				case 'adr_creation': return 'ADR creation';
				case 'prompt_generation': return 'prompt generation';
				case 'schema_design': return 'schema/database design';
				default: return t;
			}
		});

		return {
			tier: 'deliberate',
			reason: `Detected architectural decision context: ${triggerDescriptions.join(', ')}`,
			triggers
		};
	}

	// Check if this is a simple/quick question
	if (matchesAny(message, QUICK_PATTERNS)) {
		// But verify it doesn't have complexity indicators
		const complexityCount = countMatches(message, COMPLEXITY_INDICATORS);
		if (complexityCount === 0) {
			return {
				tier: 'quick',
				reason: 'Simple question detected',
				triggers: ['simple_question']
			};
		}
	}

	// Check for complexity indicators that push toward standard
	const complexityCount = countMatches(message, COMPLEXITY_INDICATORS);

	// Message length heuristic
	const wordCount = message.split(/\s+/).length;

	// Short messages with low complexity → quick
	if (wordCount < 30 && complexityCount === 0) {
		return {
			tier: 'quick',
			reason: 'Brief message with low complexity',
			triggers: ['low_complexity']
		};
	}

	// Default to standard tier for normal architectural discussion
	return {
		tier: 'standard',
		reason: 'Standard architectural discussion',
		triggers: ['default']
	};
}

/**
 * Check if a tool call should trigger deliberation
 */
export function shouldDeliberateForTool(
	toolName: string,
	config: ArchitectConfig
): TriggerResult | null {
	// Tool calls that warrant deliberation
	if (toolName === 'create_architecture_decision' && config.triggerOnADRCreation) {
		return {
			tier: 'deliberate',
			reason: 'Creating architecture decision record',
			triggers: ['tool_adr_creation']
		};
	}

	if (toolName === 'create_claude_code_prompt' && config.triggerOnPromptGeneration) {
		return {
			tier: 'deliberate',
			reason: 'Generating implementation prompt',
			triggers: ['tool_prompt_generation']
		};
	}

	return null;
}

/**
 * Analyze conversation history to determine if we should escalate tier
 */
export function analyzeConversationForEscalation(
	messages: { role: string; content: string }[],
	currentTier: ConsultationTier,
	config: ArchitectConfig
): TriggerResult | null {
	// Only escalate, never de-escalate
	if (currentTier === 'deliberate') {
		return null;
	}

	// Look at recent assistant messages for signs we're heading toward major decisions
	const recentAssistant = messages
		.filter(m => m.role === 'assistant')
		.slice(-3)
		.map(m => m.content)
		.join(' ');

	// Check if the conversation is converging on a major decision
	const decisionIndicators = [
		/\brecommend\b/i,
		/\bsuggest\b.*\b(approach|pattern|architecture)\b/i,
		/\bshould\s+we\b/i,
		/\bnext\s+step/i,
		/\bimplement/i
	];

	const indicatorCount = countMatches(recentAssistant, decisionIndicators);

	// If multiple decision indicators and we're at quick tier, escalate to standard
	if (currentTier === 'quick' && indicatorCount >= 2) {
		return {
			tier: 'standard',
			reason: 'Conversation converging on architectural decisions',
			triggers: ['conversation_escalation']
		};
	}

	// Check for deliberation triggers in the whole conversation
	const allUserMessages = messages
		.filter(m => m.role === 'user')
		.map(m => m.content)
		.join(' ');

	const result = detectConsultationTier(allUserMessages, config);

	// If conversation as a whole warrants deliberation, escalate
	if (result.tier === 'deliberate' && currentTier !== 'deliberate') {
		return {
			tier: 'deliberate',
			reason: 'Conversation context warrants multi-model consultation',
			triggers: [...result.triggers, 'conversation_analysis']
		};
	}

	return null;
}
