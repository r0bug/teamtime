import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import {
	getKitProfileForVendor,
	upsertKitProfile,
	KitProfileError
} from '$lib/server/services/kit-profile-service';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) return json({ error: 'Vendor portal access not enabled' }, { status: 403 });

	const kitId = url.searchParams.get('kit_id');
	const profile = await getKitProfileForVendor(vendor.id, kitId);
	if (!profile) return json({ error: 'No kit profile' }, { status: 404 });
	return json(profile);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) return json({ error: 'Vendor portal access not enabled' }, { status: 403 });

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') return json({ error: 'JSON body required' }, { status: 400 });

	try {
		const row = await upsertKitProfile(vendor.id, body);
		return json(row);
	} catch (err) {
		if (err instanceof KitProfileError) return json({ error: err.message }, { status: 400 });
		throw err;
	}
};
