import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { db } from '$lib/server/db';
import { vendors } from '$lib/server/db/schema';
import {
	getNewsletter,
	listSends,
	normalizeBlocks,
	saveNewsletter,
	sendNewsletterTest,
	sendNewsletterToVendors
} from '$lib/server/services/vendor-newsletter-service';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/dashboard');
	if (!isManager(locals.user)) throw error(403, 'Managers only');
	const newsletter = await getNewsletter(params.id);
	if (!newsletter) throw error(404, 'Newsletter not found');

	const [{ count: recipientCount }] = await db
		.select({ count: sql<number>`COUNT(DISTINCT LOWER(${vendors.contactEmail}))::int` })
		.from(vendors)
		.where(and(eq(vendors.status, 'active'), isNotNull(vendors.contactEmail)));

	return {
		newsletter,
		sends: await listSends(params.id),
		recipientCount,
		myEmail: locals.user.email ?? ''
	};
};

async function requireDraft(params: { id: string }) {
	const newsletter = await getNewsletter(params.id);
	if (!newsletter) throw error(404, 'Newsletter not found');
	return newsletter;
}

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const newsletter = await requireDraft(params);
		if (newsletter.status !== 'draft') return fail(400, { error: 'Sent newsletters are read-only' });

		const form = await request.formData();
		const title = String(form.get('title') || '').trim();
		if (!title) return fail(400, { error: 'Title is required' });
		const periodStart = String(form.get('periodStart') || '');
		const periodEnd = String(form.get('periodEnd') || '');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))
			return fail(400, { error: 'Invalid reporting period' });
		if (periodEnd < periodStart) return fail(400, { error: 'Period end is before start' });

		let blocks;
		try {
			blocks = normalizeBlocks(JSON.parse(String(form.get('blocks') || '[]')));
		} catch {
			return fail(400, { error: 'Malformed blocks payload' });
		}

		await saveNewsletter(
			{
				id: params.id,
				title,
				subject: String(form.get('subject') || '').trim() || null,
				periodStart,
				periodEnd,
				publishToPortal: form.get('publishToPortal') === 'on',
				blocks
			},
			locals.user.id
		);
		return { saved: true };
	},

	testSend: async ({ locals, params, request }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const newsletter = await requireDraft(params);
		const form = await request.formData();
		const to = String(form.get('to') || '').trim();
		if (!to || !to.includes('@')) return fail(400, { error: 'Enter a valid email address' });
		const ok = await sendNewsletterTest(newsletter, to);
		return ok ? { tested: true } : fail(500, { error: 'Test send failed — check SMTP config/logs' });
	},

	send: async ({ locals, params }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const newsletter = await requireDraft(params);
		if (newsletter.status !== 'draft') return fail(400, { error: 'Already sent' });
		const result = await sendNewsletterToVendors(newsletter, locals.user.id);
		return { sendResult: result };
	}
};
