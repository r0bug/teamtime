#!/usr/bin/env npx tsx
/**
 * Backfill the 'vendor' extra-role for every user currently linked to a
 * portal-enabled vendor. Prior to this script, enablePortal() didn't write
 * to user_extra_roles, so isVendor() was returning false for real vendor
 * users. Idempotent — runs INSERT ... ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   npx tsx scripts/backfill-vendor-extra-roles.ts
 *   npx tsx scripts/backfill-vendor-extra-roles.ts --dry-run
 */

import 'dotenv/config';
import postgres from 'postgres';

const DATABASE_URL =
	process.env.DATABASE_URL || 'postgresql://teamtime:teamtime_dev_password@localhost:5432/teamtime';

const dryRun = process.argv.includes('--dry-run');
const sql = postgres(DATABASE_URL);

async function main() {
	const candidates = await sql<{ user_id: string; vendor_id: string; display_name: string }[]>`
		SELECT v.user_id, v.id AS vendor_id, v.display_name
		FROM vendors v
		WHERE v.user_id IS NOT NULL
		  AND v.portal_enabled = true
		  AND NOT EXISTS (
		    SELECT 1 FROM user_extra_roles uer
		    WHERE uer.user_id = v.user_id AND uer.role = 'vendor'
		  )
	`;

	console.log(`Found ${candidates.length} portal-enabled vendor users missing the 'vendor' extra-role.`);
	for (const c of candidates) {
		console.log(`  vendor=${c.display_name} user_id=${c.user_id}`);
	}

	if (dryRun) {
		console.log('Dry run — no inserts.');
		return;
	}

	if (candidates.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	const inserted = await sql`
		INSERT INTO user_extra_roles (user_id, role)
		SELECT v.user_id, 'vendor'
		FROM vendors v
		WHERE v.user_id IS NOT NULL
		  AND v.portal_enabled = true
		ON CONFLICT (user_id, role) DO NOTHING
		RETURNING user_id
	`;
	console.log(`Inserted ${inserted.length} rows into user_extra_roles.`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(async () => {
		await sql.end();
	});
