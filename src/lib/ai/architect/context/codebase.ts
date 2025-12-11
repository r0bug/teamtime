// Codebase Context Provider - Analyzes project structure
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AIContextProvider } from '../../types';

const execAsync = promisify(exec);

interface CodebaseContext {
	apiRoutes: string[];
	pages: string[];
	libModules: string[];
	components: string[];
	totalFiles: number;
}

export const codebaseContextProvider: AIContextProvider<CodebaseContext> = {
	moduleId: 'codebase',
	moduleName: 'Codebase Structure',
	description: 'Overview of the project file structure, routes, and modules',
	priority: 20,
	agents: ['architect'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<CodebaseContext> {
		try {
			// Get API routes
			const apiResult = await execAsync('find src/routes/api -name "+server.ts" 2>/dev/null | head -50', {
				cwd: process.cwd()
			});
			const apiRoutes = apiResult.stdout
				.trim()
				.split('\n')
				.filter(Boolean)
				.map(f => f.replace('src/routes/api/', '/api/').replace('/+server.ts', ''));

			// Get pages
			const pagesResult = await execAsync('find src/routes -name "+page.svelte" 2>/dev/null | head -50', {
				cwd: process.cwd()
			});
			const pages = pagesResult.stdout
				.trim()
				.split('\n')
				.filter(Boolean)
				.map(f => f.replace('src/routes', '').replace('/+page.svelte', '') || '/');

			// Get lib modules
			const libResult = await execAsync('find src/lib -type d -maxdepth 2 2>/dev/null', {
				cwd: process.cwd()
			});
			const libModules = libResult.stdout
				.trim()
				.split('\n')
				.filter(Boolean)
				.filter(d => d !== 'src/lib')
				.map(d => d.replace('src/lib/', ''));

			// Get component files
			const componentsResult = await execAsync('find src -name "*.svelte" 2>/dev/null | wc -l', {
				cwd: process.cwd()
			});
			const componentCount = parseInt(componentsResult.stdout.trim(), 10) || 0;

			// Get total file count
			const totalResult = await execAsync('find src -name "*.ts" -o -name "*.svelte" 2>/dev/null | wc -l', {
				cwd: process.cwd()
			});
			const totalFiles = parseInt(totalResult.stdout.trim(), 10) || 0;

			return {
				apiRoutes,
				pages,
				libModules,
				components: [`${componentCount} Svelte components`],
				totalFiles
			};
		} catch (error) {
			return {
				apiRoutes: [],
				pages: [],
				libModules: [],
				components: [],
				totalFiles: 0
			};
		}
	},

	estimateTokens(context: CodebaseContext): number {
		const content = this.formatForPrompt(context);
		return Math.ceil(content.length / 4);
	},

	formatForPrompt(context: CodebaseContext): string {
		return `## Codebase Structure

**Total Files:** ${context.totalFiles} TypeScript/Svelte files

### API Routes (${context.apiRoutes.length})
${context.apiRoutes.map(r => `- ${r}`).join('\n') || '- None found'}

### Pages (${context.pages.length})
${context.pages.map(p => `- ${p}`).join('\n') || '- None found'}

### Lib Modules
${context.libModules.map(m => `- ${m}`).join('\n') || '- None found'}

### Components
${context.components.join('\n')}`;
	}
};
