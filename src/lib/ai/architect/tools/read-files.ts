// Read Files Tool - Allows architect to read codebase files
import type { AITool, ToolExecutionContext } from '../../types';
import {
	readFile,
	readFiles,
	searchFiles,
	formatFileForContext
} from '$lib/server/services/file-reader';

interface ReadFilesParams {
	paths: string[];
	includeLineNumbers?: boolean;
}

interface ReadFilesResult {
	success: boolean;
	files: Array<{
		path: string;
		content?: string;
		formattedContent?: string;
		size?: number;
		error?: string;
	}>;
	totalFilesRead: number;
	totalSize: number;
	errors: string[];
}

export const readFilesTool: AITool<ReadFilesParams, ReadFilesResult> = {
	name: 'read_files',
	description: 'Read the contents of specific files from the codebase. Use this to examine actual implementation details, understand code structure, and provide accurate analysis based on real code.',
	agent: 'architect',
	parameters: {
		type: 'object',
		properties: {
			paths: {
				type: 'array',
				items: { type: 'string' },
				description: 'Array of file paths to read (relative to project root, e.g., "src/lib/server/db/schema.ts")'
			},
			includeLineNumbers: {
				type: 'boolean',
				description: 'Whether to include line numbers in the formatted output (default: true)'
			}
		},
		required: ['paths']
	},

	requiresApproval: false,
	rateLimit: {
		maxPerHour: 100
	},

	validate(params: ReadFilesParams) {
		if (!params.paths || !Array.isArray(params.paths)) {
			return { valid: false, error: 'paths must be an array of file paths' };
		}
		if (params.paths.length === 0) {
			return { valid: false, error: 'At least one file path must be provided' };
		}
		if (params.paths.length > 10) {
			return { valid: false, error: 'Maximum 10 files can be read at once' };
		}
		return { valid: true };
	},

	async execute(params: ReadFilesParams, _context: ToolExecutionContext): Promise<ReadFilesResult> {
		const includeLineNumbers = params.includeLineNumbers ?? true;
		const results = await readFiles(params.paths);

		const files = results.map(result => {
			if (result.success && result.content) {
				return {
					path: result.path,
					content: result.content,
					formattedContent: formatFileForContext(result.path, result.content, { includeLineNumbers }),
					size: result.size
				};
			}
			return {
				path: result.path,
				error: result.error
			};
		});

		const successfulReads = files.filter(f => !f.error);
		const errors = files.filter(f => f.error).map(f => `${f.path}: ${f.error}`);

		return {
			success: errors.length === 0,
			files,
			totalFilesRead: successfulReads.length,
			totalSize: successfulReads.reduce((sum, f) => sum + (f.size || 0), 0),
			errors
		};
	},

	formatResult(result: ReadFilesResult): string {
		const sections: string[] = [];

		sections.push(`## File Read Results\n`);
		sections.push(`**Files Read:** ${result.totalFilesRead}/${result.files.length}`);
		sections.push(`**Total Size:** ${Math.round(result.totalSize / 1024)}KB\n`);

		if (result.errors.length > 0) {
			sections.push('**Errors:**');
			result.errors.forEach(e => sections.push(`- ${e}`));
			sections.push('');
		}

		// Include the formatted file contents
		for (const file of result.files) {
			if (file.formattedContent) {
				sections.push(file.formattedContent);
			}
		}

		return sections.join('\n');
	}
};

// Search files tool
interface SearchFilesParams {
	pattern: string;
	searchContent?: boolean;
	extensions?: string[];
	maxResults?: number;
}

interface SearchFilesResult {
	success: boolean;
	files: string[];
	total: number;
	truncated: boolean;
}

export const searchFilesTool: AITool<SearchFilesParams, SearchFilesResult> = {
	name: 'search_files',
	description: 'Search for files in the codebase by filename pattern or content. Use this to discover relevant files before reading them.',
	agent: 'architect',
	parameters: {
		type: 'object',
		properties: {
			pattern: {
				type: 'string',
				description: 'Search pattern (regex supported, e.g., "permission|role" to find permission/role related files)'
			},
			searchContent: {
				type: 'boolean',
				description: 'If true, also search within file contents (slower). Default: false (filename only)'
			},
			extensions: {
				type: 'array',
				items: { type: 'string' },
				description: 'Limit search to specific extensions (e.g., [".ts", ".svelte"]). Default: all allowed types'
			},
			maxResults: {
				type: 'number',
				description: 'Maximum number of results to return. Default: 50'
			}
		},
		required: ['pattern']
	},

	requiresApproval: false,
	rateLimit: {
		maxPerHour: 50
	},

	validate(params: SearchFilesParams) {
		if (!params.pattern || typeof params.pattern !== 'string') {
			return { valid: false, error: 'pattern must be a non-empty string' };
		}
		if (params.pattern.length < 2) {
			return { valid: false, error: 'pattern must be at least 2 characters' };
		}
		return { valid: true };
	},

	async execute(params: SearchFilesParams, _context: ToolExecutionContext): Promise<SearchFilesResult> {
		const result = await searchFiles(params.pattern, {
			searchContent: params.searchContent,
			extensions: params.extensions,
			maxResults: params.maxResults || 50
		});

		return {
			success: true,
			files: result.files,
			total: result.total,
			truncated: result.truncated
		};
	},

	formatResult(result: SearchFilesResult): string {
		const sections: string[] = [];

		sections.push(`## File Search Results\n`);
		sections.push(`**Total Matches:** ${result.total}`);
		if (result.truncated) {
			sections.push(`*(Showing first ${result.files.length} results)*\n`);
		} else {
			sections.push('');
		}

		if (result.files.length > 0) {
			sections.push('**Files Found:**');
			result.files.forEach(f => sections.push(`- \`${f}\``));
		} else {
			sections.push('*No files matched the search pattern*');
		}

		return sections.join('\n');
	}
};

// Export both tools
export const fileTools = [readFilesTool, searchFilesTool];
