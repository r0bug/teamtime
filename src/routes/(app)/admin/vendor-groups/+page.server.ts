import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	listGroups,
	createGroup,
	updateGroup,
	archiveGroup
} from '$lib/server/services/vendor-group-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	const groups = await listGroups({ includeArchived: true });
	return { groups };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const color = (data.get('color') as string) || '#6B7280';
		const displayOrderRaw = (data.get('displayOrder') as string) || '0';
		if (!name) return fail(400, { error: 'Name is required' });
		try {
			await createGroup({
				name,
				color,
				displayOrder: parseInt(displayOrderRaw, 10) || 0,
				createdByUserId: locals.user!.id
			});
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not create group' });
		}
		return { success: 'create' };
	},

	update: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const id = data.get('id') as string;
		const name = (data.get('name') as string)?.trim();
		const color = (data.get('color') as string) || undefined;
		const displayOrderRaw = (data.get('displayOrder') as string) || '';
		if (!id || !name) return fail(400, { error: 'id and name required' });
		try {
			await updateGroup(id, {
				name,
				color,
				displayOrder: displayOrderRaw ? parseInt(displayOrderRaw, 10) : undefined
			});
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not update group' });
		}
		return { success: 'update' };
	},

	archive: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		await archiveGroup(id);
		return { success: 'archive' };
	}
};
