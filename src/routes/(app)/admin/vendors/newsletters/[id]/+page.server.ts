import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import { db } from '$lib/server/db';
import { vendors } from '$lib/server/db/schema';
import {
	getNewsletter,
	isoDateString,
	listSends,
	normalizeBlocks,
	saveNewsletter,
	sendNewsletterTest,
	sendNewsletterToOneVendor,
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

	// For the single-vendor send picker: anyone with an email, any status —
	// targeted sends are a deliberate admin choice (resends, new vendors, etc.)
	const sendableVendors = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			status: vendors.status,
			contactEmail: vendors.contactEmail
		})
		.from(vendors)
		.where(isNotNull(vendors.contactEmail))
		.orderBy(vendors.displayName);

	return {
		// date columns arrive as JS Dates from postgres-js — hand the UI strings.
		newsletter: {
			...newsletter,
			periodStart: isoDateString(newsletter.periodStart),
			periodEnd: isoDateString(newsletter.periodEnd)
		},
		sends: await listSends(params.id),
		recipientCount,
		sendableVendors,
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

		// datetime-local string, interpreted in server time (TZ=America/Los_Angeles
		// in prod — matches how the rest of the app treats wall-clock input).
		let scheduledSendAt: Date | null = null;
		const scheduleRaw = String(form.get('scheduledSendAt') || '').trim();
		if (scheduleRaw) {
			scheduledSendAt = new Date(scheduleRaw);
			if (isNaN(scheduledSendAt.getTime())) return fail(400, { error: 'Invalid scheduled send time' });
		}
		const recurrence = String(form.get('recurrence') || '') === 'monthly' ? 'monthly' as const : null;
		if (recurrence && !scheduledSendAt)
			return fail(400, { error: 'Monthly recurrence needs a scheduled send time' });

		await saveNewsletter(
			{
				id: params.id,
				title,
				subject: String(form.get('subject') || '').trim() || null,
				periodStart,
				periodEnd,
				publishToPortal: form.get('publishToPortal') === 'on',
				blocks,
				scheduledSendAt,
				recurrence
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

	sendOne: async ({ locals, params, request }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const newsletter = await requireDraft(params);
		const form = await request.formData();
		const vendorId = String(form.get('vendorId') || '');
		if (!vendorId) return fail(400, { error: 'Pick a vendor' });
		const result = await sendNewsletterToOneVendor(newsletter, vendorId);
		if (!result.ok) return fail(400, { error: result.error });
		return { sentOne: result.email };
	},

	send: async ({ locals, params }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const newsletter = await requireDraft(params);
		if (newsletter.status !== 'draft') return fail(400, { error: 'Already sent' });
		const result = await sendNewsletterToVendors(newsletter, locals.user.id);
		return { sendResult: result };
	}
};
