// Schema Context Provider - Reads and parses schema.ts
import fs from 'fs/promises';
import path from 'path';
import type { AIContextProvider } from '../../types';

interface SchemaContext {
	exists: boolean;
	content: string;
	tables: string[];
	enums: string[];
	types: string[];
}

export const schemaContextProvider: AIContextProvider<SchemaContext> = {
	moduleId: 'schema',
	moduleName: 'Database Schema',
	description: 'The Drizzle ORM schema defining all database tables and types',
	priority: 15,
	agents: ['architect'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<SchemaContext> {
		try {
			const schemaPath = path.join(process.cwd(), 'src/lib/server/db/schema.ts');
			const content = await fs.readFile(schemaPath, 'utf-8');

			// Extract table names (pgTable declarations)
			const tableMatches = content.matchAll(/export const (\w+) = pgTable\(/g);
			const tables = [...tableMatches].map(m => m[1]);

			// Extract enum names (pgEnum declarations)
			const enumMatches = content.matchAll(/export const (\w+) = pgEnum\(/g);
			const enums = [...enumMatches].map(m => m[1]);

			// Extract type exports
			const typeMatches = content.matchAll(/export type (\w+) =/g);
			const types = [...typeMatches].map(m => m[1]);

			return {
				exists: true,
				content,
				tables,
				enums,
				types
			};
		} catch (error) {
			return {
				exists: false,
				content: '',
				tables: [],
				enums: [],
				types: []
			};
		}
	},

	estimateTokens(context: SchemaContext): number {
		return Math.ceil(context.content.length / 4);
	},

	formatForPrompt(context: SchemaContext): string {
		if (!context.exists) {
			return '## Database Schema\n\n*Schema file not found.*';
		}

		return `## Database Schema (schema.ts)

**Tables (${context.tables.length}):** ${context.tables.join(', ')}

**Enums (${context.enums.length}):** ${context.enums.join(', ')}

**Types (${context.types.length}):** ${context.types.join(', ')}

---

\`\`\`typescript
${context.content}
\`\`\``;
	}
};
