import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import {
	getVendor,
	updateVendor,
	getVendorAgreements,
	signAgreement,
	setInventoryPrefix,
	setVendorGroups,
	getVendorGroups,
	enablePortal,
	inviteVendorToPortal,
	resetPortalPassword,
	disablePortal,
	markOnboardingComplete,
	getVendorAuthStatus,
	unlockPortalAccount,
	listLinkableUsers,
	linkExistingUserToVendor,
	setAgreementSignedDocument,
	VendorServiceError
} from '$lib/server/services/vendor-service';
import { isUploadPath } from '$lib/uploads';
import { listTemplates } from '$lib/server/services/agreement-template-service';
import { listGroups } from '$lib/server/services/vendor-group-service';
import { isAdmin } from '$lib/server/auth/roles';
import { hasTechAccess, TECH } from '$lib/server/auth/tech';
import { audit } from '$lib/server/services/audit-service';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/dashboard');

	const vendor = await getVendor(params.id);
	if (!vendor) throw error(404, 'Vendor not found');

	const [agreements, templates, allGroups, vendorGroupRows, authStatus, linkableUsers] = await Promise.all([
		getVendorAgreements(params.id),
		listTemplates({ includeInactive: false, includeArchived: false }),
		listGroups({ includeArchived: false }),
		getVendorGroups(params.id),
		getVendorAuthStatus(params.id),
		listLinkableUsers()
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
		vendorGroupIds: vendorGroupRows.map((g) => g.id),
		authStatus,
		linkableUsers
	};
};

export const actions: Actions = {
	updateTerms: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();

		const monthlyRentDollarsStr = (data.get('monthlyRentDollars') as string) ?? '';
		const monthlyRentCents = monthlyRentDollarsStr
			? Math.round(parseFloat(monthlyRentDollarsStr) * 100)
			: null;

		const nrsVendorIdRaw = ((data.get('nrsVendorId') as string) ?? '').trim();
		const nrsVendorId = nrsVendorIdRaw ? parseInt(nrsVendorIdRaw, 10) : null;

		// nrsVendorId is an identity-link field: reassigning it rewires which NRS
		// sales/payouts roll up to this vendor record. It is admin-only and audited,
		// matching the REST contract in api/vendors/[id]. Only gate/audit when it
		// actually changes (this form always submits the current value).
		const before = await getVendor(params.id);
		if (!before) return fail(404, { error: 'Vendor not found' });
		const nrsChanged = (before.nrsVendorId ?? null) !== nrsVendorId;
		if (nrsChanged && !isAdmin(locals.user)) {
			return fail(403, { error: 'Admin role required to change the NRS Vendor ID' });
		}

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
			vendorPaymentPercent: ((data.get('vendorPaymentPercent') as string) ?? '').trim() || null,
			status: ((data.get('status') as string) ?? 'inactive') as 'active' | 'inactive' | 'terminated',
			startDate: ((data.get('startDate') as string) ?? '').trim() || null,
			endDate: ((data.get('endDate') as string) ?? '').trim() || null,
			nrsVendorId,
			notes: ((data.get('notes') as string) ?? '').trim() || null
		});

		if (nrsChanged) {
			await audit({
				userId: locals.user.id,
				action: 'vendor.identity_reassign',
				entityType: 'vendor',
				entityId: params.id,
				beforeData: { nrsVendorId: before.nrsVendorId ?? null },
				afterData: { nrsVendorId }
			});
		}

		return { success: 'updateTerms' };
	},

	signAgreement: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });

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

	uploadSignedDocument: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });

		const data = await request.formData();
		const agreementId = (data.get('agreementId') as string) ?? '';
		const filePath = (data.get('filePath') as string) ?? '';
		const originalName = ((data.get('originalName') as string) ?? 'signed-contract').trim();
		const mimeType = (data.get('mimeType') as string) ?? 'application/octet-stream';
		const sizeBytes = Number(data.get('sizeBytes')) || 0;

		if (!agreementId) return fail(400, { error: 'agreementId required' });
		// filePath comes from POST /api/uploads — confine it to /uploads/ (no traversal).
		if (!isUploadPath(filePath)) return fail(400, { error: 'Invalid file path' });

		try {
			await setAgreementSignedDocument({
				vendorId: params.id,
				agreementId,
				filePath,
				originalName,
				mimeType,
				sizeBytes,
				uploadedByUserId: locals.user!.id
			});
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to attach document' });
		}

		return { success: 'uploadSignedDocument' };
	},

	updateOnboarding: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
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
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		const complete = (await request.formData()).get('complete') !== 'false';
		await markOnboardingComplete(params.id, complete);
		return { success: 'markOnboardingComplete' };
	},

	linkUser: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		const userId = ((await request.formData()).get('userId') as string) ?? '';
		if (!userId) return fail(400, { error: 'Pick a user to link' });
		try {
			await linkExistingUserToVendor({ vendorId: params.id, userId });
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'linkUser' };
	},

	enablePortal: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		if (!hasTechAccess(locals, TECH.vendorCredentials, () => true)) {
			return fail(403, { error: 'Vendor credential management requires tech access' });
		}
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

	inviteToPortal: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		if (!hasTechAccess(locals, TECH.vendorCredentials, () => true)) {
			return fail(403, { error: 'Vendor credential management requires tech access' });
		}
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const data = await request.formData();
		const sendEmail = data.get('sendEmail') === 'on';
		const sendSms = data.get('sendSms') === 'on';
		if (!sendEmail && !sendSms) {
			return fail(400, { error: 'Pick at least one channel (email or SMS)' });
		}
		try {
			const result = await inviteVendorToPortal({
				vendorId: params.id,
				channels: { email: sendEmail, sms: sendSms },
				sentByUserId: locals.user.id
			});
			return {
				success: 'inviteToPortal',
				channelsSucceeded: result.channelsSucceeded,
				channelsFailed: result.channelsFailed,
				tempPassword: result.tempPassword
			};
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
	},

	resetPortalPassword: async ({ locals, params, request }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		if (!hasTechAccess(locals, TECH.vendorCredentials, () => true)) {
			return fail(403, { error: 'Vendor credential management requires tech access' });
		}
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
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		if (!hasTechAccess(locals, TECH.vendorCredentials, () => true)) {
			return fail(403, { error: 'Vendor credential management requires tech access' });
		}
		try {
			await disablePortal(params.id);
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'disablePortal' };
	},

	unlockPortal: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { error: 'Not authorized' });
		if (!hasTechAccess(locals, TECH.vendorCredentials, () => true)) {
			return fail(403, { error: 'Vendor credential management requires tech access' });
		}
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		try {
			await unlockPortalAccount(params.id, locals.user.id);
		} catch (err) {
			if (err instanceof VendorServiceError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'unlockPortal' };
	}
};
