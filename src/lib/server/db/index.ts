import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$env/static/private';

const connectionString = DATABASE_URL || 'postgresql://teamtime:teamtime_dev_password@localhost:5432/teamtime';

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export * from './schema';
