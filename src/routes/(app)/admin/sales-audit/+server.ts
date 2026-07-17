/**
 * GET /admin/sales-audit — serves the standalone Sales Re-Ring / Duplicate Audit
 * dashboard (self-contained HTML with the NRS analysis embedded). Manager/admin only.
 *
 * The page is a static forensic report generated offline from the NRS API
 * (identical-item + opposite-tender duplicate detection). It links each
 * transaction back to NRS via arCashRegForm?view=<arCashRegId>.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import html from '$lib/server/reports/sales-audit.html?raw';

export const GET: RequestHandler = async ({ locals }) => {
	if (!isManager(locals.user)) throw error(403, 'Access denied');
	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
