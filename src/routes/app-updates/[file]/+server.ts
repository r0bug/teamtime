import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { updatesDir, isValidUpdateFile } from '$lib/server/services/app-updates';

/**
 * GET /app-updates/<file> — public, read-only. Serves latest.json (the Tauri
 * updater manifest) and the signed update bundles. No auth: the desktop app
 * checks for updates before login. Bundles are signed, so public is safe.
 */
export const GET: RequestHandler = async ({ params }) => {
	const file = params.file;
	if (!isValidUpdateFile(file)) throw error(404, 'Not found');
	const data = readFileSync(join(updatesDir(), file));
	const isJson = file.endsWith('.json');
	return new Response(data, {
		headers: {
			'Content-Type': isJson ? 'application/json' : 'application/octet-stream',
			'Cache-Control': 'no-cache'
		}
	});
};
