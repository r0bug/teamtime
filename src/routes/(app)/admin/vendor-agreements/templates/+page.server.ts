import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { listTemplates } from '$lib/server/services/agreement-template-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const templates = await listTemplates({ includeInactive: true, includeArchived: true });
	return { templates };
};
