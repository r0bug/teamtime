import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL || 'postgresql://teamtime:teamtime_dev_password@localhost:5432/teamtime'
	},
	verbose: true,
	strict: true
});
