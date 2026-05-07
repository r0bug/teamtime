import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { listVendors, createVendor } from '$lib/server/services/vendor-service';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const status = url.searchParams.get('status');
	const search = url.searchParams.get('q') ?? undefined;
	const filters: Parameters<typeof listVendors>[0] = {};
	if (status === 'active' || status === 'inactive' || status === 'terminated') filters.status = status;
	if (search) filters.search = search;

	const rows = await listVendors(filters);
	return json({ vendors: rows });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const body = await request.json();
	if (!body.displayName || typeof body.displayName !== 'string') {
		throw error(400, 'displayName is required');
	}

	const vendor = await createVendor(
		{
			displayName: body.displayName,
			nrsVendorId: body.nrsVendorId ?? null,
			userId: body.userId ?? null,
			contactName: body.contactName ?? null,
			contactEmail: body.contactEmail ?? null,
			contactPhone: body.contactPhone ?? null,
			addressLine1: body.addressLine1 ?? null,
			addressLine2: body.addressLine2 ?? null,
			city: body.city ?? null,
			state: body.state ?? null,
			zip: body.zip ?? null,
			boothNumber: body.boothNumber ?? null,
			monthlyRentCents: body.monthlyRentCents ?? null,
			maxDiscountPercent: body.maxDiscountPercent ?? null,
			status: body.status ?? 'inactive',
			startDate: body.startDate ?? null,
			endDate: body.endDate ?? null,
			notes: body.notes ?? null
		},
		locals.user!.id
	);

	return json({ vendor }, { status: 201 });
};
