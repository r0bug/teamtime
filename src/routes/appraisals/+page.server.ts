/**
 * GET /appraisals — single sign-on hop to value.trickpc.com (photo appraisal tool).
 *
 * Lives outside the (app) group on purpose: that layout confines Vendor-type
 * users to /vendor/*, but vendors use the appraisal tool too.
 */
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	VALUE_APP_URL,
	getValueAppIdentity,
	mintSsoToken,
	valueAppSecret
} from '$lib/server/services/value-app-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const secret = valueAppSecret();
	if (!secret) throw error(503, 'The appraisal tool is not configured');

	const identity = await getValueAppIdentity(
		locals.user.id,
		!!locals.session?.contextVendorId
	);
	if (!identity) throw error(403, 'Your account cannot use the appraisal tool');

	throw redirect(303, `${VALUE_APP_URL}/sso?t=${encodeURIComponent(mintSsoToken(identity, secret))}`);
};
