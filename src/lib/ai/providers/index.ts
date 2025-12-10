// LLM Provider Registry
import type { LLMProvider, AIProvider } from '../types';
import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';
import { segmindProvider } from './segmind';

const providers: Record<AIProvider, LLMProvider> = {
	anthropic: anthropicProvider,
	openai: openaiProvider,
	segmind: segmindProvider
};

export function getProvider(name: AIProvider): LLMProvider {
	const provider = providers[name];
	if (!provider) {
		throw new Error(`Unknown AI provider: ${name}`);
	}
	return provider;
}

export { anthropicProvider, openaiProvider, segmindProvider };
