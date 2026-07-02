/**
 * GET /vendor/app/download/alpha/<file> — stream a staged ALPHA installer to a
 * signed-in vendor. Same whitelist guard as the stable route, against the
 * alpha/ subfolder listing.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import { alphaDir, isValidAlphaInstaller } from '$lib/server/services/app-downloads';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const file = params.file;
	if (!isValidAlphaInstaller(file)) throw error(404, 'Not found');

	const fullPath = join(alphaDir(), file);
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
