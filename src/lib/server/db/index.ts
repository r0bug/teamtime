import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$env/static/private';

if (!DATABASE_URL) {
	throw new Error('DATABASE_URL environment variable is required');
}

const connectionString = DATABASE_URL;

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export * from './schema';
