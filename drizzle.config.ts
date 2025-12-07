import type { Config } from 'drizzle-kit';

export default {
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	driver: 'pg',
	dbCredentials: {
		connectionString: process.env.DATABASE_URL || 'postgresql://teamtime:teamtime_dev_password@localhost:5432/teamtime'
	},
	verbose: true,
	strict: true
} satisfies Config;
