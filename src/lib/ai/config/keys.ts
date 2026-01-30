// API Keys Management - reads from local .ai-keys.json file (gitignored)
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AIKeysConfig, AIProvider } from '../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:config:keys');
const KEYS_FILE = join(process.cwd(), '.ai-keys.json');

// Read API keys from local config file
export function getAPIKeys(): AIKeysConfig {
	try {
		if (!existsSync(KEYS_FILE)) {
			return {};
		}
		const content = readFileSync(KEYS_FILE, 'utf-8');
		return JSON.parse(content) as AIKeysConfig;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		log.error({ error: errorMsg, keysFile: KEYS_FILE }, 'Error reading API keys file');
		return {};
	}
}

// Get a specific provider's API key
export function getAPIKey(provider: AIProvider): string | undefined {
	const keys = getAPIKeys();
	return keys[provider];
}

// Save API keys to local config file
export function saveAPIKeys(keys: AIKeysConfig): boolean {
	try {
		writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8');
		return true;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		log.error({ error: errorMsg, keysFile: KEYS_FILE }, 'Error saving API keys file');
		return false;
	}
}

// Update a single provider's API key
export function updateAPIKey(provider: AIProvider, key: string): boolean {
	const keys = getAPIKeys();
	keys[provider] = key;
	return saveAPIKeys(keys);
}

// Check if a provider's API key is configured
export function hasAPIKey(provider: AIProvider): boolean {
	const key = getAPIKey(provider);
	return !!key && key.length > 0;
}

// Get available (configured) providers
export function getAvailableProviders(): AIProvider[] {
	const keys = getAPIKeys();
	const available: AIProvider[] = [];
	if (keys.anthropic) available.push('anthropic');
	if (keys.openai) available.push('openai');
	if (keys.segmind) available.push('segmind');
	return available;
}
