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
		// Estimate based on truncated length
		const MAX_SCHEMA_LENGTH = 6000;
		const length = Math.min(context.content.length, MAX_SCHEMA_LENGTH);
		return Math.ceil(length / 4) + 100; // +100 for headers
	},

	formatForPrompt(context: SchemaContext): string {
		if (!context.exists) {
			return '## Database Schema\n\n*Schema file not found.*';
		}

		// Truncate schema content to avoid token limits
		const MAX_SCHEMA_LENGTH = 6000;
		let schemaContent = context.content;
		let truncated = false;
		if (schemaContent.length > MAX_SCHEMA_LENGTH) {
			schemaContent = schemaContent.substring(0, MAX_SCHEMA_LENGTH);
			truncated = true;
		}

		return `## Database Schema (schema.ts)

**Tables (${context.tables.length}):** ${context.tables.join(', ')}

**Enums (${context.enums.length}):** ${context.enums.join(', ')}

**Types (${context.types.length}):** ${context.types.join(', ')}

*Note: Use read_files tool to see full schema if needed.*

---

\`\`\`typescript
${schemaContent}
\`\`\`${truncated ? '\n\n... [Schema truncated - use read_files for full content]' : ''}`;
	}
};
