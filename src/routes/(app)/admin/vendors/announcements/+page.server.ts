import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	listAllAnnouncements,
	saveAnnouncement,
	setAnnouncementActive,
	setAnnouncementPinned
} from '$lib/server/services/vendor-announcements-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/dashboard');
	if (!isManager(locals.user)) throw error(403, 'Managers only');
	return { announcements: await listAllAnnouncements() };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const form = await request.formData();
		const id = String(form.get('id') || '') || null;
		const title = String(form.get('title') || '').trim();
		const body = String(form.get('body') || '').trim();
		const pinned = form.get('pinned') === 'on';
		const expiresRaw = String(form.get('expiresAt') || '').trim();
		if (!title) return fail(400, { error: 'Title is required' });
		if (!body) return fail(400, { error: 'Body is required' });
		let expiresAt: Date | null = null;
		if (expiresRaw) {
			expiresAt = new Date(expiresRaw + 'T23:59:59');
			if (isNaN(expiresAt.getTime())) return fail(400, { error: 'Invalid expiry date' });
		}
		await saveAnnouncement({ id, title, body, pinned, expiresAt }, locals.user.id);
		return { saved: true };
	},
	togglePinned: async ({ locals, request }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const form = await request.formData();
		await setAnnouncementPinned(String(form.get('id')), form.get('pinned') === 'true');
		return { saved: true };
	},
	toggleActive: async ({ locals, request }) => {
		if (!locals.user || !isManager(locals.user)) return fail(403, { error: 'Managers only' });
		const form = await request.formData();
		await setAnnouncementActive(String(form.get('id')), form.get('active') === 'true');
		return { saved: true };
	}
};
