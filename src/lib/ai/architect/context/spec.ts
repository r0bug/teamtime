// Spec Context Provider - Reads Spec.md from project root
import fs from 'fs/promises';
import path from 'path';
import type { AIContextProvider } from '../../types';

interface SpecContext {
	exists: boolean;
	content: string;
	sections: string[];
	lastModified?: Date;
}

export const specContextProvider: AIContextProvider<SpecContext> = {
	moduleId: 'spec',
	moduleName: 'Project Specification',
	description: 'The Spec.md file containing project requirements and documentation',
	priority: 10, // High priority - foundational context
	agents: ['architect'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<SpecContext> {
		try {
			const specPath = path.join(process.cwd(), 'Spec.md');
			const content = await fs.readFile(specPath, 'utf-8');
			const stats = await fs.stat(specPath);

			// Extract section headers (lines starting with #)
			const sections = content
				.split('\n')
				.filter(line => line.startsWith('#'))
				.map(line => line.replace(/^#+\s*/, ''));

			return {
				exists: true,
				content,
				sections,
				lastModified: stats.mtime
			};
		} catch (error) {
			return {
				exists: false,
				content: '',
				sections: []
			};
		}
	},

	estimateTokens(context: SpecContext): number {
		// Estimate based on truncated length
		const MAX_SPEC_LENGTH = 4000;
		const length = Math.min(context.content.length, MAX_SPEC_LENGTH);
		return Math.ceil(length / 4) + 50;
	},

	formatForPrompt(context: SpecContext): string {
		if (!context.exists) {
			return '## Project Specification\n\n*No Spec.md file found in project root.*';
		}

		// Truncate spec content to avoid token limits
		const MAX_SPEC_LENGTH = 4000;
		let specContent = context.content;
		let truncated = false;
		if (specContent.length > MAX_SPEC_LENGTH) {
			specContent = specContent.substring(0, MAX_SPEC_LENGTH);
			truncated = true;
		}

		return `## Project Specification (Spec.md)

**Sections:** ${context.sections.join(', ')}
**Last Modified:** ${context.lastModified?.toISOString() || 'Unknown'}

*Note: Use read_files tool to see full spec if needed.*

---

${specContent}${truncated ? '\n\n... [Spec truncated - use read_files for full content]' : ''}`;
	}
};
