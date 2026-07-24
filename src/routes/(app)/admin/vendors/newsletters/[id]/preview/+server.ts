import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	getNewsletter,
	renderNewsletter,
	wrapEmail
} from '$lib/server/services/vendor-newsletter-service';

/**
 * Browser preview of the outgoing email, loaded in the editor's iframe.
 * Renders the *saved* draft (the editor saves before refreshing the preview);
 * the chart is inlined as a data: URI since there's no mail transport here.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user || !isManager(locals.user)) throw error(403, 'Managers only');
	const newsletter = await getNewsletter(params.id);
	if (!newsletter) throw error(404, 'Newsletter not found');

	const rendered = await renderNewsletter(newsletter, 'email', { chartMode: 'data' });
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head>
<body style="margin:0;background:#f3f4f6;padding:16px 0;">${wrapEmail(newsletter.title, rendered.html, 'Hi Vendor Name,')}</body></html>`;

	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
	});
};
