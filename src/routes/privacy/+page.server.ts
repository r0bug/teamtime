import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const siteTitleSetting = await db.query.appSettings.findFirst({
		where: eq(appSettings.key, 'site_title')
	});

	return {
		siteTitle: siteTitleSetting?.value || 'TeamTime'
	};
};
