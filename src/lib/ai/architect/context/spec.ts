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
		// Rough estimate: ~4 chars per token
		return Math.ceil(context.content.length / 4);
	},

	formatForPrompt(context: SpecContext): string {
		if (!context.exists) {
			return '## Project Specification\n\n*No Spec.md file found in project root.*';
		}

		return `## Project Specification (Spec.md)

**Sections:** ${context.sections.join(', ')}
**Last Modified:** ${context.lastModified?.toISOString() || 'Unknown'}

---

${context.content}`;
	}
};
