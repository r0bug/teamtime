import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { listFormatsModifiedSince } from '$lib/server/services/label-format-service';

/**
 * GET /api/label-formats?modified_since=<version_int>
 * Returns { version: <maxVersionInResults>, formats: [...] }.
 * Any signed-in user may read the catalog; it's not vendor-secret.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });

	const raw = url.searchParams.get('modified_since');
	const sinceVersion = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;

	const formats = await listFormatsModifiedSince(sinceVersion);
	const maxVersion = formats.reduce((acc, f) => Math.max(acc, f.version), sinceVersion);

	return json({ version: maxVersion, formats });
};
