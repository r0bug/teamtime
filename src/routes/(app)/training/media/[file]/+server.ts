/**
 * GET /training/media/<file> — stream a training video/poster to signed-in
 * staff. Supports HTTP Range so <video> can seek. Only files listed in the
 * training manifest are served (no path traversal, nothing else in the dir).
 * Not covered by the (app) layout's load, so it gates on its own.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { ROLES, type UserRole } from '$lib/server/auth/roles';
import { resolveTrainingFile, mimeFor, parseRange } from '$lib/server/services/training-resources';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!(ROLES as readonly string[]).includes(locals.user.role as UserRole)) throw error(403, 'Forbidden');

	const filePath = await resolveTrainingFile(params.file);
	if (!filePath) throw error(404, 'Not found');
	const st = await stat(filePath).catch(() => null);
	if (!st?.isFile()) throw error(404, 'Not found');

	const headers: Record<string, string> = {
		'Content-Type': mimeFor(params.file),
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'private, max-age=3600'
	};
	const range = parseRange(request.headers.get('range'), st.size);
	if (range === 'invalid') {
		return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${st.size}` } });
	}
	if (range) {
		const stream = Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end })) as unknown as ReadableStream;
		return new Response(stream, {
			status: 206,
			headers: {
				...headers,
				'Content-Range': `bytes ${range.start}-${range.end}/${st.size}`,
				'Content-Length': String(range.end - range.start + 1)
			}
		});
	}
	const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
	return new Response(stream, { headers: { ...headers, 'Content-Length': String(st.size) } });
};
