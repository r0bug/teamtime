import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const sql = postgres(url);
const ddl = readFileSync(new URL('./notes-recipient-group-migration.sql', import.meta.url), 'utf8');

try {
	await sql.unsafe(ddl);
	const cols = await sql`
		select column_name from information_schema.columns
		where table_name = 'staff_notes' and column_name = 'recipient_group'`;
	console.log('recipient_group present:', cols.length === 1);
} catch (e) {
	console.error('Migration failed:', e.message);
	process.exitCode = 1;
} finally {
	await sql.end();
}
