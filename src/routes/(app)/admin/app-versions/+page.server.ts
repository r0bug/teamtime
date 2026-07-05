import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { hasTechAccess, TECH } from '$lib/server/auth/tech';
import { currentVersion, listInstallers, listArchivedVersions } from '$lib/server/services/app-downloads';

// Manager-gated: older label-app versions live in hidden archive-<version>/ dirs,
// invisible to vendors. This page is the only way to reach them (rollback / giving
// a vendor a specific older build).
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/dashboard');
	if (!hasTechAccess(locals, TECH.appReleases, isManager)) throw redirect(302, '/dashboard');

	const current = {
		version: currentVersion(),
		files: listInstallers()
	};
	return { current, archived: listArchivedVersions() };
};
