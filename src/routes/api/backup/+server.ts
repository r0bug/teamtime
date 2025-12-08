import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, appSettings } from '$lib/server/db';
import { isManager } from '$lib/server/auth/roles';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import { Readable } from 'stream';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ locals }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// Get all settings
		const settings = await db.select().from(appSettings);
		const settingsJson = JSON.stringify(settings, null, 2);

		// Run pg_dump
		const dbUrl = process.env.DATABASE_URL || '';
		let dbDump = '';

		try {
			const { stdout } = await execAsync(`pg_dump "${dbUrl}" --no-owner --no-acl`);
			dbDump = stdout;
		} catch (pgError: any) {
			console.error('pg_dump error:', pgError.message);
			dbDump = `-- Database dump failed: ${pgError.message}\n-- Please ensure pg_dump is installed and accessible`;
		}

		// Create zip archive
		const archive = archiver('zip', { zlib: { level: 9 } });
		const chunks: Buffer[] = [];

		// Collect archive data
		archive.on('data', (chunk) => chunks.push(chunk));

		// Add files to archive
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		archive.append(settingsJson, { name: `settings_${timestamp}.json` });
		archive.append(dbDump, { name: `database_${timestamp}.sql` });

		// Create a backup info file
		const backupInfo = JSON.stringify({
			createdAt: new Date().toISOString(),
			createdBy: locals.user?.name || 'Unknown',
			version: '1.0',
			contents: ['settings', 'database']
		}, null, 2);
		archive.append(backupInfo, { name: 'backup_info.json' });

		await archive.finalize();

		// Wait for all chunks
		await new Promise<void>((resolve) => archive.on('end', resolve));

		const zipBuffer = Buffer.concat(chunks);

		return new Response(zipBuffer, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="teamtime_backup_${timestamp}.zip"`,
				'Content-Length': zipBuffer.length.toString()
			}
		});
	} catch (error) {
		console.error('Backup error:', error);
		return json({ error: 'Failed to create backup' }, { status: 500 });
	}
};
