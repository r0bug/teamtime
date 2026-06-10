import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const sql = postgres(url);
const ddl = readFileSync(new URL('./notes-migration.sql', import.meta.url), 'utf8');

try {
	await sql.unsafe(ddl);
	const [{ t }] = await sql`select to_regclass('public.staff_notes') as t`;
	const cols = await sql`
		select column_name from information_schema.columns
		where table_name = 'staff_notes' order by ordinal_position`;
	console.log('staff_notes regclass:', t);
	console.log('columns:', cols.map((c) => c.column_name).join(', '));
} catch (e) {
	console.error('Migration failed:', e.message);
	process.exitCode = 1;
} finally {
	await sql.end();
}
