import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { listPrinters } from '$lib/server/services/printer-service';

/**
 * GET /api/printers — the registered label-printer registry (read-only).
 *
 * Open to any authenticated user: staff (the Labels & Tags hub loads it
 * server-side, but this endpoint mirrors it) and the standalone label app, which
 * needs to know which printers exist. Actual printer selection happens app-side.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });
	const printers = await listPrinters();
	return json({ printers });
};
