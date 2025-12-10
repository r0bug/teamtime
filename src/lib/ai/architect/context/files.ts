// Files Context Provider - Provides file content context for architect
import type { AIContextProvider } from '../../types';
import {
	readFile,
	searchFiles,
	formatFileForContext,
	getCacheStats
} from '$lib/server/services/file-reader';

interface FilesContext {
	requestedFiles: Array<{
		path: string;
		content?: string;
		error?: string;
		size?: number;
	}>;
	searchResults?: {
		pattern: string;
		files: string[];
		truncated: boolean;
	};
	cacheStats: {
		size: number;
		maxSize: number;
	};
}

// Files that should be requested for context loading
let requestedFilePaths: string[] = [];
let searchPattern: string | null = null;

/**
 * Set the files to load for context
 */
export function setRequestedFiles(paths: string[]): void {
	requestedFilePaths = paths;
}

/**
 * Set a search pattern to find files
 */
export function setSearchPattern(pattern: string | null): void {
	searchPattern = pattern;
}

/**
 * Clear requested files
 */
export function clearRequestedFiles(): void {
	requestedFilePaths = [];
	searchPattern = null;
}

export const filesContextProvider: AIContextProvider<FilesContext> = {
	moduleId: 'files',
	moduleName: 'File Contents',
	description: 'Actual file contents from the codebase for detailed analysis',
	priority: 15, // Higher priority than codebase structure
	agents: ['architect'],

	async isEnabled() {
		// Only enabled if files have been requested
		return requestedFilePaths.length > 0 || searchPattern !== null;
	},

	async getContext(): Promise<FilesContext> {
		const requestedFiles: FilesContext['requestedFiles'] = [];

		// Read requested files
		for (const filePath of requestedFilePaths) {
			const result = await readFile(filePath);
			requestedFiles.push({
				path: filePath,
				content: result.content,
				error: result.error,
				size: result.size
			});
		}

		// Search for files if pattern provided
		let searchResults: FilesContext['searchResults'] | undefined;
		if (searchPattern) {
			const result = await searchFiles(searchPattern, {
				searchContent: true,
				maxResults: 20
			});
			searchResults = {
				pattern: searchPattern,
				files: result.files,
				truncated: result.truncated
			};
		}

		const cacheStats = getCacheStats();

		return {
			requestedFiles,
			searchResults,
			cacheStats: {
				size: cacheStats.size,
				maxSize: cacheStats.maxSize
			}
		};
	},

	estimateTokens(context: FilesContext): number {
		// Estimate based on content length
		let totalChars = 0;

		for (const file of context.requestedFiles) {
			if (file.content) {
				totalChars += file.content.length;
			}
		}

		// Add overhead for formatting
		totalChars += 500;

		// Rough estimate: 4 chars per token
		return Math.ceil(totalChars / 4);
	},

	formatForPrompt(context: FilesContext): string {
		const sections: string[] = [];

		sections.push('## File Contents\n');

		if (context.requestedFiles.length === 0 && !context.searchResults) {
			sections.push('*No files loaded. Use the `read_files` or `search_files` tools to examine specific files.*\n');
			return sections.join('\n');
		}

		// Show search results if any
		if (context.searchResults) {
			sections.push(`### Search Results for "${context.searchResults.pattern}"\n`);
			if (context.searchResults.files.length > 0) {
				sections.push(`Found ${context.searchResults.files.length} files${context.searchResults.truncated ? ' (truncated)' : ''}:\n`);
				context.searchResults.files.forEach(f => sections.push(`- \`${f}\``));
			} else {
				sections.push('*No files matched the search pattern*');
			}
			sections.push('');
		}

		// Show file contents
		const successfulFiles = context.requestedFiles.filter(f => f.content);
		const failedFiles = context.requestedFiles.filter(f => f.error);

		if (failedFiles.length > 0) {
			sections.push('### Files Not Accessible\n');
			failedFiles.forEach(f => {
				sections.push(`- \`${f.path}\`: ${f.error}`);
			});
			sections.push('');
		}

		if (successfulFiles.length > 0) {
			sections.push(`### Loaded Files (${successfulFiles.length})\n`);

			for (const file of successfulFiles) {
				if (file.content) {
					sections.push(formatFileForContext(file.path, file.content, {
						includeLineNumbers: true,
						maxLines: 150
					}));
					sections.push('');
				}
			}
		}

		return sections.join('\n');
	}
};

/**
 * Smart file loader - determines which files to load based on the message content
 */
export async function smartLoadFiles(message: string): Promise<string[]> {
	const loadedFiles: string[] = [];

	// Extract potential file paths from the message
	const filePathPattern = /(?:src\/[^\s,'"]+\.[a-z]+|[a-zA-Z]+\.[a-z]+\.ts)/gi;
	const mentionedPaths = message.match(filePathPattern) || [];

	for (const path of mentionedPaths.slice(0, 5)) {
		const result = await readFile(path);
		if (result.success) {
			loadedFiles.push(path);
		}
	}

	// Look for keywords that suggest specific file types
	const keywordPatterns: Record<string, string[]> = {
		'schema|database|table|migration': ['src/lib/server/db/schema.ts'],
		'permission|role|auth|access': ['src/lib/server/auth/roles.ts', 'src/lib/server/auth/index.ts'],
		'inventory|drop': ['src/lib/server/services/inventory-drops.ts'],
		'layout|navigation|sidebar': ['src/routes/(app)/+layout.svelte'],
		'task': ['src/routes/(app)/tasks/+page.server.ts', 'src/routes/api/tasks/+server.ts']
	};

	for (const [keywords, files] of Object.entries(keywordPatterns)) {
		const pattern = new RegExp(keywords, 'i');
		if (pattern.test(message)) {
			for (const file of files) {
				if (!loadedFiles.includes(file)) {
					const result = await readFile(file);
					if (result.success) {
						loadedFiles.push(file);
					}
				}
			}
		}
	}

	return loadedFiles.slice(0, 5); // Limit to 5 files
}
