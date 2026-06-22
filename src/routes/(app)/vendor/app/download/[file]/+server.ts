/**
 * GET /vendor/app/download/<file> — stream a staged installer to a signed-in
 * vendor. Filenames are whitelisted against the downloads directory listing so
 * there's no path traversal.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import { downloadsDir, isValidInstaller } from '$lib/server/services/app-downloads';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const file = params.file;
	if (!isValidInstaller(file)) throw error(404, 'Not found');

	const fullPath = join(downloadsDir(), file);
	const nodeStream = createReadStream(fullPath);
	const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

	return new Response(webStream, {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Disposition': `attachment; filename="${file}"`,
			'Cache-Control': 'no-store'
		}
	});
};
