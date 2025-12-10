// Analyze Impact Tool - Analyzes potential impact of changes
// Now with actual file reading capabilities for concrete analysis
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AITool, ToolExecutionContext } from '../../types';
import {
	readFile,
	searchFiles,
	formatFileForContext
} from '$lib/server/services/file-reader';

const execAsync = promisify(exec);

interface AnalyzeImpactParams {
	changeDescription: string;
	targetFiles?: string[];
	changeType: 'schema' | 'api' | 'ui' | 'refactor' | 'new_feature' | 'permission';
	readFiles?: boolean; // Whether to read and include file contents
	searchPatterns?: string[]; // Additional patterns to search for related files
}

interface FileImpact {
	file: string;
	reason: string;
	severity: 'high' | 'medium' | 'low';
	content?: string; // Actual file content if read
	relevantLines?: { start: number; end: number; snippet: string }[];
}

interface AnalyzeImpactResult {
	success: boolean;
	affectedFiles: FileImpact[];
	riskAssessment: {
		level: 'high' | 'medium' | 'low';
		factors: string[];
	};
	recommendations: string[];
	codeContext?: string; // Formatted code context for AI analysis
	error?: string;
}

export const analyzeImpactTool: AITool<AnalyzeImpactParams, AnalyzeImpactResult> = {
	name: 'analyze_change_impact',
	description: 'Analyze the potential impact of a proposed change on the codebase. Identifies affected files, reads their contents, and provides detailed risk assessment based on actual code analysis.',
	agent: 'architect',
	parameters: {
		type: 'object',
		properties: {
			changeDescription: {
				type: 'string',
				description: 'Description of the proposed change (e.g., "Add staff role permission to inventory access")'
			},
			targetFiles: {
				type: 'array',
				items: { type: 'string' },
				description: 'Specific files that will be modified (if known)'
			},
			changeType: {
				type: 'string',
				enum: ['schema', 'api', 'ui', 'refactor', 'new_feature', 'permission'],
				description: 'Type of change being analyzed'
			},
			readFiles: {
				type: 'boolean',
				description: 'Whether to read and include actual file contents for detailed analysis (default: true)'
			},
			searchPatterns: {
				type: 'array',
				items: { type: 'string' },
				description: 'Additional regex patterns to search for related files (e.g., ["isManager", "role.*check"])'
			}
		},
		required: ['changeDescription', 'changeType']
	},

	requiresApproval: false,
	rateLimit: {
		maxPerHour: 30
	},

	validate(params: AnalyzeImpactParams) {
		if (!params.changeDescription || params.changeDescription.length < 10) {
			return { valid: false, error: 'Change description must be at least 10 characters' };
		}
		const validTypes = ['schema', 'api', 'ui', 'refactor', 'new_feature', 'permission'];
		if (!validTypes.includes(params.changeType)) {
			return { valid: false, error: `Change type must be one of: ${validTypes.join(', ')}` };
		}
		return { valid: true };
	},

	async execute(params: AnalyzeImpactParams, _context: ToolExecutionContext): Promise<AnalyzeImpactResult> {
		try {
			const affectedFiles: FileImpact[] = [];
			const riskFactors: string[] = [];
			const recommendations: string[] = [];
			const shouldReadFiles = params.readFiles !== false; // Default to true

			// Analyze based on change type
			switch (params.changeType) {
				case 'schema':
					await analyzeSchemaImpact(params, affectedFiles, riskFactors, recommendations);
					break;
				case 'api':
					await analyzeApiImpact(params, affectedFiles, riskFactors, recommendations);
					break;
				case 'ui':
					await analyzeUiImpact(params, affectedFiles, riskFactors, recommendations);
					break;
				case 'permission':
					await analyzePermissionImpact(params, affectedFiles, riskFactors, recommendations);
					break;
				case 'refactor':
				case 'new_feature':
					await analyzeGeneralImpact(params, affectedFiles, riskFactors, recommendations);
					break;
			}

			// Search for additional files based on custom patterns
			if (params.searchPatterns?.length) {
				for (const pattern of params.searchPatterns) {
					const searchResult = await searchFiles(pattern, {
						searchContent: true,
						maxResults: 10
					});
					for (const file of searchResult.files) {
						if (!affectedFiles.some(f => f.file === file)) {
							affectedFiles.push({
								file,
								reason: `Contains pattern: ${pattern}`,
								severity: 'medium'
							});
						}
					}
				}
			}

			// If specific target files provided, add them with high severity
			if (params.targetFiles?.length) {
				for (const file of params.targetFiles) {
					const existing = affectedFiles.find(f => f.file === file);
					if (existing) {
						existing.severity = 'high';
						existing.reason = 'Explicitly specified as target - ' + existing.reason;
					} else {
						affectedFiles.push({
							file,
							reason: 'Explicitly specified as target',
							severity: 'high'
						});
					}
				}
			}

			// Read file contents if requested
			let codeContext = '';
			if (shouldReadFiles) {
				const filesToRead = affectedFiles
					.filter(f => f.severity === 'high' || f.severity === 'medium')
					.slice(0, 5); // Limit to top 5 files

				for (const fileImpact of filesToRead) {
					const result = await readFile(fileImpact.file);
					if (result.success && result.content) {
						fileImpact.content = result.content;

						// Find relevant lines based on change description keywords
						const keywords = extractKeywords(params.changeDescription);
						const relevantLines = findRelevantLines(result.content, keywords);
						if (relevantLines.length > 0) {
							fileImpact.relevantLines = relevantLines;
						}

						// Format for context
						codeContext += formatFileForContext(fileImpact.file, result.content, {
							maxLines: 100
						}) + '\n\n';
					}
				}
			}

			// Calculate overall risk level
			const highCount = affectedFiles.filter(f => f.severity === 'high').length;
			const totalCount = affectedFiles.length;
			let riskLevel: 'high' | 'medium' | 'low' = 'low';

			if (highCount > 3 || totalCount > 10) {
				riskLevel = 'high';
				riskFactors.push('Large number of files affected');
			} else if (highCount > 0 || totalCount > 5) {
				riskLevel = 'medium';
			}

			// Add type-specific recommendations
			if (riskLevel === 'high') {
				recommendations.push('Consider breaking this change into smaller, incremental updates');
				recommendations.push('Create comprehensive tests before implementing');
				recommendations.push('Plan for potential rollback strategy');
			}

			return {
				success: true,
				affectedFiles,
				riskAssessment: {
					level: riskLevel,
					factors: riskFactors
				},
				recommendations,
				codeContext: codeContext || undefined
			};
		} catch (error) {
			return {
				success: false,
				affectedFiles: [],
				riskAssessment: { level: 'high', factors: ['Analysis failed'] },
				recommendations: ['Unable to complete impact analysis - proceed with caution'],
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: AnalyzeImpactResult): string {
		if (!result.success) {
			return `Impact analysis failed: ${result.error}`;
		}

		const sections: string[] = [];

		sections.push(`## Impact Analysis Results`);
		sections.push('');
		sections.push(`**Risk Level:** ${result.riskAssessment.level.toUpperCase()}`);

		if (result.riskAssessment.factors.length > 0) {
			sections.push('');
			sections.push('**Risk Factors:**');
			result.riskAssessment.factors.forEach(f => sections.push(`- ${f}`));
		}

		if (result.affectedFiles.length > 0) {
			sections.push('');
			sections.push(`**Affected Files (${result.affectedFiles.length}):**`);
			result.affectedFiles.forEach(f => {
				sections.push(`- \`${f.file}\` [${f.severity}] - ${f.reason}`);
				if (f.relevantLines?.length) {
					f.relevantLines.slice(0, 3).forEach(line => {
						sections.push(`  - Lines ${line.start}-${line.end}: \`${line.snippet.substring(0, 60)}...\``);
					});
				}
			});
		}

		if (result.recommendations.length > 0) {
			sections.push('');
			sections.push('**Recommendations:**');
			result.recommendations.forEach((r, i) => sections.push(`${i + 1}. ${r}`));
		}

		if (result.codeContext) {
			sections.push('');
			sections.push('---');
			sections.push('## Relevant Code Context');
			sections.push('');
			sections.push(result.codeContext);
		}

		return sections.join('\n');
	}
};

// Helper functions

function extractKeywords(description: string): string[] {
	// Extract meaningful keywords from the description
	const words = description.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(w => w.length > 3);

	// Filter out common words
	const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'should', 'could', 'would', 'when', 'where', 'what', 'which']);
	return words.filter(w => !stopWords.has(w));
}

function findRelevantLines(
	content: string,
	keywords: string[]
): { start: number; end: number; snippet: string }[] {
	const lines = content.split('\n');
	const results: { start: number; end: number; snippet: string }[] = [];
	const foundRanges = new Set<string>();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].toLowerCase();
		for (const keyword of keywords) {
			if (line.includes(keyword)) {
				// Include some context (2 lines before and after)
				const start = Math.max(0, i - 1);
				const end = Math.min(lines.length - 1, i + 2);
				const rangeKey = `${start}-${end}`;

				if (!foundRanges.has(rangeKey)) {
					foundRanges.add(rangeKey);
					results.push({
						start: start + 1, // 1-indexed
						end: end + 1,
						snippet: lines.slice(start, end + 1).join('\n').trim()
					});
				}
				break;
			}
		}
	}

	return results.slice(0, 5); // Limit to 5 relevant sections
}

// Analysis functions for different change types

async function analyzeSchemaImpact(
	params: AnalyzeImpactParams,
	affectedFiles: FileImpact[],
	riskFactors: string[],
	recommendations: string[]
): Promise<void> {
	// Schema changes affect many parts of the app
	affectedFiles.push({
		file: 'src/lib/server/db/schema.ts',
		reason: 'Schema definition file',
		severity: 'high'
	});

	affectedFiles.push({
		file: 'src/lib/server/db/index.ts',
		reason: 'Database exports may need updating',
		severity: 'medium'
	});

	// Search for files that import from db
	const dbImports = await searchFiles('from.*\\$lib/server/db', {
		searchContent: true,
		maxResults: 15
	});

	for (const file of dbImports.files) {
		if (!affectedFiles.some(f => f.file === file)) {
			affectedFiles.push({
				file,
				reason: 'Imports from database module',
				severity: 'medium'
			});
		}
	}

	riskFactors.push('Schema changes require database migration');
	riskFactors.push('May affect multiple API endpoints');
	recommendations.push('Run `pnpm drizzle-kit generate` to create migration');
	recommendations.push('Update any TypeScript types that depend on the schema');
	recommendations.push('Test migration on a backup first');
}

async function analyzeApiImpact(
	params: AnalyzeImpactParams,
	affectedFiles: FileImpact[],
	riskFactors: string[],
	recommendations: string[]
): Promise<void> {
	// Find API routes
	try {
		const { stdout } = await execAsync(
			'find src/routes/api -name "+server.ts" 2>/dev/null | head -20',
			{ cwd: process.cwd() }
		);

		stdout.trim().split('\n').filter(Boolean).slice(0, 10).forEach(file => {
			affectedFiles.push({
				file,
				reason: 'API endpoint that may need updates',
				severity: 'medium'
			});
		});
	} catch {
		// Ignore errors
	}

	// Search for fetch calls
	const fetchCalls = await searchFiles('fetch\\(.*api', {
		searchContent: true,
		extensions: ['.svelte', '.ts'],
		maxResults: 10
	});

	for (const file of fetchCalls.files) {
		if (!affectedFiles.some(f => f.file === file)) {
			affectedFiles.push({
				file,
				reason: 'Contains API fetch calls',
				severity: 'low'
			});
		}
	}

	riskFactors.push('API changes may break frontend components');
	recommendations.push('Update API documentation if endpoints change');
	recommendations.push('Consider versioning the API if it is public');
}

async function analyzeUiImpact(
	params: AnalyzeImpactParams,
	affectedFiles: FileImpact[],
	riskFactors: string[],
	recommendations: string[]
): Promise<void> {
	// Find Svelte components
	try {
		const { stdout } = await execAsync(
			'find src/routes -name "+page.svelte" 2>/dev/null | head -15',
			{ cwd: process.cwd() }
		);

		stdout.trim().split('\n').filter(Boolean).slice(0, 5).forEach(file => {
			affectedFiles.push({
				file,
				reason: 'Page component that may be affected',
				severity: 'medium'
			});
		});
	} catch {
		// Ignore errors
	}

	// Find CSS files
	affectedFiles.push({
		file: 'src/app.css',
		reason: 'Global styles',
		severity: 'low'
	});

	recommendations.push('Test across different screen sizes');
	recommendations.push('Verify accessibility compliance');
	recommendations.push('Check mobile responsive behavior');
}

async function analyzePermissionImpact(
	params: AnalyzeImpactParams,
	affectedFiles: FileImpact[],
	riskFactors: string[],
	recommendations: string[]
): Promise<void> {
	// Permission changes are high-impact and need careful analysis

	// Find role/permission related files
	const roleFiles = await searchFiles('isManager|isAdmin|role.*===|permission', {
		searchContent: true,
		maxResults: 20
	});

	for (const file of roleFiles.files) {
		affectedFiles.push({
			file,
			reason: 'Contains role/permission checks',
			severity: 'high'
		});
	}

	// Check auth-related files specifically
	const authFiles = [
		'src/lib/server/auth/roles.ts',
		'src/lib/server/auth/index.ts',
		'src/hooks.server.ts'
	];

	for (const file of authFiles) {
		if (!affectedFiles.some(f => f.file === file)) {
			affectedFiles.push({
				file,
				reason: 'Core authentication/authorization file',
				severity: 'high'
			});
		}
	}

	// Search for route protection patterns
	const routeProtection = await searchFiles('locals\\.user', {
		searchContent: true,
		extensions: ['.ts'],
		maxResults: 15
	});

	for (const file of routeProtection.files) {
		if (!affectedFiles.some(f => f.file === file)) {
			affectedFiles.push({
				file,
				reason: 'Uses user authentication context',
				severity: 'medium'
			});
		}
	}

	riskFactors.push('Permission changes affect security boundaries');
	riskFactors.push('May expose or restrict functionality unintentionally');
	riskFactors.push('Requires thorough testing of all affected routes');

	recommendations.push('Audit all permission checks before and after change');
	recommendations.push('Create test cases for each role/permission combination');
	recommendations.push('Review security implications with team');
	recommendations.push('Consider creating an architecture decision record');
}

async function analyzeGeneralImpact(
	params: AnalyzeImpactParams,
	affectedFiles: FileImpact[],
	riskFactors: string[],
	recommendations: string[]
): Promise<void> {
	// For general changes, look at lib modules
	try {
		const { stdout } = await execAsync(
			'find src/lib -name "*.ts" -type f 2>/dev/null | head -15',
			{ cwd: process.cwd() }
		);

		stdout.trim().split('\n').filter(Boolean).slice(0, 5).forEach(file => {
			affectedFiles.push({
				file,
				reason: 'Library module potentially affected',
				severity: 'low'
			});
		});
	} catch {
		// Ignore errors
	}

	recommendations.push('Review test coverage for affected areas');
	recommendations.push('Consider adding integration tests');
}
