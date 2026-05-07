import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { createVendor } from '$lib/server/services/vendor-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });

		const data = await request.formData();
		const displayName = (data.get('displayName') as string)?.trim();
		if (!displayName) return fail(400, { error: 'Vendor name is required' });

		const monthlyRentDollars = parseFloat((data.get('monthlyRentDollars') as string) ?? '');
		const monthlyRentCents = isFinite(monthlyRentDollars) ? Math.round(monthlyRentDollars * 100) : null;

		const maxDiscountPercent = (data.get('maxDiscountPercent') as string) || null;
		const nrsVendorIdRaw = (data.get('nrsVendorId') as string) || '';
		const nrsVendorId = nrsVendorIdRaw ? parseInt(nrsVendorIdRaw, 10) : null;

		const status = ((data.get('status') as string) ?? 'inactive') as 'active' | 'inactive' | 'terminated';

		const vendor = await createVendor(
			{
				displayName,
				nrsVendorId: nrsVendorId && !isNaN(nrsVendorId) ? nrsVendorId : null,
				contactName: ((data.get('contactName') as string) ?? '').trim() || null,
				contactEmail: ((data.get('contactEmail') as string) ?? '').trim().toLowerCase() || null,
				contactPhone: ((data.get('contactPhone') as string) ?? '').trim() || null,
				addressLine1: ((data.get('addressLine1') as string) ?? '').trim() || null,
				addressLine2: ((data.get('addressLine2') as string) ?? '').trim() || null,
				city: ((data.get('city') as string) ?? '').trim() || null,
				state: ((data.get('state') as string) ?? '').trim() || null,
				zip: ((data.get('zip') as string) ?? '').trim() || null,
				boothNumber: ((data.get('boothNumber') as string) ?? '').trim() || null,
				monthlyRentCents,
				maxDiscountPercent,
				status,
				startDate: ((data.get('startDate') as string) ?? '').trim() || null,
				endDate: ((data.get('endDate') as string) ?? '').trim() || null,
				notes: ((data.get('notes') as string) ?? '').trim() || null
			},
			locals.user!.id
		);

		throw redirect(303, `/admin/vendors/${vendor.id}`);
	}
};
