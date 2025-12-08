// Analyze Impact Tool - Analyzes potential impact of changes
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import type { AITool, ToolExecutionContext } from '../../types';

const execAsync = promisify(exec);

interface AnalyzeImpactParams {
	changeDescription: string;
	targetFiles?: string[];
	changeType: 'schema' | 'api' | 'ui' | 'refactor' | 'new_feature';
}

interface FileImpact {
	file: string;
	reason: string;
	severity: 'high' | 'medium' | 'low';
}

interface AnalyzeImpactResult {
	success: boolean;
	affectedFiles: FileImpact[];
	riskAssessment: {
		level: 'high' | 'medium' | 'low';
		factors: string[];
	};
	recommendations: string[];
	error?: string;
}

export const analyzeImpactTool: AITool<AnalyzeImpactParams, AnalyzeImpactResult> = {
	name: 'analyze_change_impact',
	description: 'Analyze the potential impact of a proposed change on the codebase. Identifies affected files and assesses risk.',
	agent: 'architect',
	parameters: {
		type: 'object',
		properties: {
			changeDescription: {
				type: 'string',
				description: 'Description of the proposed change (e.g., "Add new field to users table")'
			},
			targetFiles: {
				type: 'array',
				items: { type: 'string' },
				description: 'Specific files that will be modified (if known)'
			},
			changeType: {
				type: 'string',
				enum: ['schema', 'api', 'ui', 'refactor', 'new_feature'],
				description: 'Type of change being analyzed'
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
		const validTypes = ['schema', 'api', 'ui', 'refactor', 'new_feature'];
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
				case 'refactor':
				case 'new_feature':
					await analyzeGeneralImpact(params, affectedFiles, riskFactors, recommendations);
					break;
			}

			// If specific target files provided, add them
			if (params.targetFiles?.length) {
				for (const file of params.targetFiles) {
					if (!affectedFiles.some(f => f.file === file)) {
						affectedFiles.push({
							file,
							reason: 'Explicitly specified as target',
							severity: 'high'
						});
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

			// Add standard recommendations
			if (riskLevel === 'high') {
				recommendations.push('Consider breaking this change into smaller, incremental updates');
				recommendations.push('Create comprehensive tests before implementing');
				recommendations.push('Plan for potential rollback strategy');
			}
			if (params.changeType === 'schema') {
				recommendations.push('Create a database migration script');
				recommendations.push('Test migration on a backup first');
			}

			return {
				success: true,
				affectedFiles,
				riskAssessment: {
					level: riskLevel,
					factors: riskFactors
				},
				recommendations
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
			});
		}

		if (result.recommendations.length > 0) {
			sections.push('');
			sections.push('**Recommendations:**');
			result.recommendations.forEach((r, i) => sections.push(`${i + 1}. ${r}`));
		}

		return sections.join('\n');
	}
};

// Helper functions for different change types

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

	// Find API routes that might use the affected tables
	try {
		const { stdout } = await execAsync(
			'find src/routes/api -name "+server.ts" 2>/dev/null | head -20',
			{ cwd: process.cwd() }
		);
		const apiRoutes = stdout.trim().split('\n').filter(Boolean);

		// Add a subset of API routes as potentially affected
		apiRoutes.slice(0, 5).forEach(route => {
			affectedFiles.push({
				file: route,
				reason: 'API route may need schema updates',
				severity: 'medium'
			});
		});
	} catch {
		// Ignore errors
	}

	riskFactors.push('Schema changes require database migration');
	riskFactors.push('May affect multiple API endpoints');
	recommendations.push('Run `pnpm drizzle-kit generate` to create migration');
	recommendations.push('Update any TypeScript types that depend on the schema');
}

async function analyzeApiImpact(
	params: AnalyzeImpactParams,
	affectedFiles: FileImpact[],
	riskFactors: string[],
	recommendations: string[]
): Promise<void> {
	// API changes may affect frontend and other services
	try {
		// Find related Svelte files that might call the API
		const { stdout: svelteFiles } = await execAsync(
			'find src/routes -name "+page.svelte" 2>/dev/null | head -10',
			{ cwd: process.cwd() }
		);

		svelteFiles.trim().split('\n').filter(Boolean).slice(0, 3).forEach(file => {
			affectedFiles.push({
				file,
				reason: 'Page may consume the affected API',
				severity: 'medium'
			});
		});
	} catch {
		// Ignore errors
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
	// UI changes generally have lower risk but may affect styling
	try {
		const { stdout } = await execAsync(
			'find src -name "*.css" -o -name "app.css" 2>/dev/null | head -5',
			{ cwd: process.cwd() }
		);

		stdout.trim().split('\n').filter(Boolean).forEach(file => {
			affectedFiles.push({
				file,
				reason: 'Stylesheet may need updates',
				severity: 'low'
			});
		});
	} catch {
		// Ignore errors
	}

	recommendations.push('Test across different screen sizes');
	recommendations.push('Verify accessibility compliance');
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
			'find src/lib -name "*.ts" -type f 2>/dev/null | head -10',
			{ cwd: process.cwd() }
		);

		stdout.trim().split('\n').filter(Boolean).slice(0, 3).forEach(file => {
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
