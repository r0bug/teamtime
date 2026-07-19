import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	deleteDraft,
	isoDateString,
	listNewsletters,
	saveNewsletter,
	starterBlocks
} from '$lib/server/services/vendor-newsletter-service';
import { resolvePeriod } from '$lib/server/services/vendor-leaderboard-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/dashboard');
	if (!isManager(locals.user)) throw error(403, 'Managers only');
	// date columns arrive as JS Dates from postgres-js — hand the UI strings.
	const newsletters = (await listNewsletters()).map((n) => ({
		...n,
		periodStart: isoDateString(n.periodStart),
		periodEnd: isoDateString(n.periodEnd)
	}));
	return { newsletters };
};

export const actions: Actions = {
	// Create a draft pre-filled with the starter block layout and the last
	// 30 days as the reporting window, then jump straight into the editor.
	create: async ({ locals }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const range = resolvePeriod('30d');
		const monthName = new Date().toLocaleDateString('en-US', {
			timeZone: 'America/Los_Angeles',
			month: 'long',
			year: 'numeric'
		});
		const row = await saveNewsletter(
			{
				title: `Vendor Newsletter — ${monthName}`,
				subject: null,
				periodStart: range.start,
				periodEnd: range.end,
				publishToPortal: true,
				blocks: starterBlocks()
			},
			locals.user.id
		);
		throw redirect(303, `/admin/vendors/newsletters/${row.id}`);
	},
	delete: async ({ locals, request }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const form = await request.formData();
		const ok = await deleteDraft(String(form.get('id')));
		if (!ok) return fail(400, { error: 'Only drafts can be deleted' });
		return { deleted: true };
	}
};
