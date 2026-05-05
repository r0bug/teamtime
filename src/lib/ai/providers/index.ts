// LLM Provider Registry
import type { LLMProvider, AIProvider } from '../types';
import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';
import { segmindProvider } from './segmind';

// DeepSeek requests dispatch through anthropicProvider — its routeForModel()
// switches URL+key when the model id starts with `deepseek-`.
const providers: Record<AIProvider, LLMProvider> = {
	anthropic: anthropicProvider,
	openai: openaiProvider,
	segmind: segmindProvider,
	deepseek: anthropicProvider
};

export function getProvider(name: AIProvider): LLMProvider {
	const provider = providers[name];
	if (!provider) {
		throw new Error(`Unknown AI provider: ${name}`);
	}
	return provider;
}

export { anthropicProvider, openaiProvider, segmindProvider };
