import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { listApiLog, apiLogCounts } from '$lib/server/services/inventory-change-service';

const FILTERS = ['all', 'success', 'failure'] as const;
type Filter = (typeof FILTERS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const raw = url.searchParams.get('result') as Filter;
	const filter: Filter = (FILTERS as readonly string[]).includes(raw) ? raw : 'all';
	const success = filter === 'success' ? true : filter === 'failure' ? false : undefined;

	const [entries, counts] = await Promise.all([listApiLog({ success, limit: 300 }), apiLogCounts()]);

	return { entries, counts, filter };
};
