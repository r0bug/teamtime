/**
 * GET /admin/app-versions/download/<dir>/<file> — stream an ARCHIVED installer to
 * a manager. `dir` is the archive-<version> subdir; both segments are whitelisted
 * against the archive listing so there's no path traversal.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { isManager } from '$lib/server/auth/roles';
import { archivedFilePath, isValidArchivedFile } from '$lib/server/services/app-downloads';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const { dir, file } = params;
	if (!isValidArchivedFile(dir, file)) throw error(404, 'Not found');

	const nodeStream = createReadStream(archivedFilePath(dir, file));
	const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

	return new Response(webStream, {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Disposition': `attachment; filename="${file}"`,
			'Cache-Control': 'no-store'
		}
	});
};
