import type { PageServerLoad } from './$types';
import { listTrainingResources } from '$lib/server/services/training-resources';

// Any signed-in staff user (the (app) layout already redirects anonymous
// users to /login and vendor-portal users to /vendor).
export const load: PageServerLoad = async () => {
	return { resources: await listTrainingResources() };
};
