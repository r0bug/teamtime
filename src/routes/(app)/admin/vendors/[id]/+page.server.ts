import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	getVendor,
	updateVendor,
	getVendorAgreements,
	signAgreement,
	setInventoryPrefix,
	setVendorGroups,
	getVendorGroups,
	enablePortal,
	resetPortalPassword,
	disablePortal,
	markOnboardingComplete,
	VendorServiceError
} from '$lib/server/services/vendor-service';
import { listTemplates } from '$lib/server/services/agreement-template-service';
import { listGroups } from '$lib/server/services/vendor-group-service';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');

	const vendor = await getVendor(params.id);
	if (!vendor) throw error(404, 'Vendor not found');

	const [agreements, templates, allGroups, vendorGroupRows] = await Promise.all([
		getVendorAgreements(params.id),
		listTemplates({ includeInactive: false, includeArchived: false }),
		listGroups({ includeArchived: false }),
		getVendorGroups(params.id)
	]);

	const signedTemplateIds = new Set(
		agreements.filter((a) => a.status === 'signed').map((a) => a.templateId)
	);
	const signedCodes = new Set(
		agreements.filter((a) => a.status === 'signed').map((a) => a.template.code)
	);

	const availableTemplates = templates.filter((t) => !signedTemplateIds.has(t.id));

	return {
		vendor,
		agreements,
		availableTemplates,
		signedCodes: Array.from(signedCodes),
		allGroups,
		vendorGroupIds: vendorGroupRows.map((g) => g.id)
	};
};

export const actions: Actions = {
	updateTerms: async ({ locals, params, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();

		const monthlyRentDollarsStr = (data.get('monthlyRentDollars') as string) ?? '';
		const monthlyRentCents = monthlyRentDollarsStr
			? Math.round(parseFloat(monthlyRentDollarsStr) * 100)
			: null;

		await updateVendor(params.id, {
			displayName: ((data.get('displayName') as string) ?? '').trim(),
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
			maxDiscountPercent: ((data.get('maxDiscountPercent') as string) ?? '').trim() || null,
			status: ((data.get('status') as string) ?? 'inactive') as 'active' | 'inactive' | 'terminated',
			startDate: ((data.get('startDate') as string) ?? '').trim() || null,
			endDate: ((data.get('endDate') as string) ?? '').trim() || null,
			nrsVendorId: ((data.get('nrsVendorId') as string) ?? '').trim()
				? parseInt((data.get('nrsVendorId') as string).trim(), 10)
				: null,
			notes: ((data.get('notes') as string) ?? '').trim() || null
		});

		return { success: 'updateTerms' };
	},

	signAgreement: async ({ locals, params, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });

		const data = await request.formData();
		const templateId = data.get('templateId') as string;
		const signedByName = ((data.get('signedByName') as string) ?? '').trim();
		const paperOriginalOnFile = data.get('paperOriginalOnFile') === 'true';
		const signatureDataUrl = (data.get('signatureDataUrl') as string) || null;

		if (!templateId) return fail(400, { error: 'templateId required' });
		if (!signedByName) return fail(400, { error: 'Signed-by name required' });
		if (!paperOriginalOnFile && (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/'))) {
			return fail(400, { error: 'Signature image or "paper original on file" is required' });
		}

		const extraFieldValues: Record<string, string | number | null> = {};
		for (const [k, v] of data.entries()) {
			if (k.startsWith('extra_field_')) {
				extraFieldValues[k.slice('extra_field_'.length)] = String(v);
			}
		}

		await signAgreement({
			vendorId: params.id,
			templateId,
			signedByName,
			signatureDataUrl: paperOriginalOnFile ? null : signatureDataUrl,
			paperOriginalOnFile,
			extraFieldValues: Object.keys(extraFieldValues).length ? extraFieldValues : undefined,
			witnessedByUserId: locals.user!.id
		});

		return { success: 'signAgreement' };
	},

	updateOnboarding: async ({ locals, params, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const prefixRaw = ((data.get('inventoryCodePrefix') as string) ?? '').trim();
		const groupIds = data.getAll('groupId').map((v) => v.toString()).filter(Boolean);

		try {
			await setInventoryPrefix(params.id, prefixRaw || null);
			await setVendorGroups(params.id, groupIds);
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'updateOnboarding' };
	},

	markOnboardingComplete: async ({ locals, params, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const complete = (await request.formData()).get('complete') !== 'false';
		await markOnboardingComplete(params.id, complete);
		return { success: 'markOnboardingComplete' };
	},

	enablePortal: async ({ locals, params, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const email = ((data.get('email') as string) ?? '').trim();
		const contactName = ((data.get('contactName') as string) ?? '').trim();
		const password = ((data.get('password') as string) ?? '');
		try {
			const result = await enablePortal({
				vendorId: params.id,
				email,
				contactName,
				password
			});
			return { success: 'enablePortal', createdUser: result.createdUser };
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
	},

	resetPortalPassword: async ({ locals, params, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const password = ((await request.formData()).get('password') as string) ?? '';
		try {
			await resetPortalPassword(params.id, password);
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'resetPortalPassword' };
	},

	disablePortal: async ({ locals, params }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		try {
			await disablePortal(params.id);
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'disablePortal' };
	}
};
