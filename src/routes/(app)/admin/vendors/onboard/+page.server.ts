import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	onboardVendor,
	BOOTH_RENTAL_COMMISSION_PERCENT,
	INDIVIDUAL_ITEM_COMMISSION_PERCENT,
	type OnboardingInput
} from '$lib/server/services/vendor-onboarding-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('route:vendors:onboard');

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	return {
		boothCommissionPercent: BOOTH_RENTAL_COMMISSION_PERCENT,
		individualCommissionPercent: INDIVIDUAL_ITEM_COMMISSION_PERCENT
	};
};

// Parse a dollar string ("75", "100.00", "$1,200") into integer cents, or null.
function dollarsToCents(raw: FormDataEntryValue | null): number | null {
	const s = String(raw ?? '').replace(/[$,\s]/g, '').trim();
	if (!s) return null;
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

function num(raw: FormDataEntryValue | null): number | null {
	const s = String(raw ?? '').trim();
	if (!s) return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

function text(raw: FormDataEntryValue | null): string | null {
	const s = String(raw ?? '').trim();
	return s.length ? s : null;
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });

		const fd = await request.formData();
		const displayName = text(fd.get('displayName'));
		if (!displayName) {
			return fail(400, { error: 'Vendor name is required' });
		}

		const maxDiscountRaw = num(fd.get('maxDiscountPercent'));
		const input: OnboardingInput = {
			displayName,
			contactName: text(fd.get('contactName')),
			contactEmail: text(fd.get('contactEmail')),
			contactPhone: text(fd.get('contactPhone')),
			addressLine1: text(fd.get('addressLine1')),
			addressLine2: text(fd.get('addressLine2')),
			city: text(fd.get('city')),
			state: text(fd.get('state')),
			zip: text(fd.get('zip')),
			boothNumber: text(fd.get('boothNumber')),
			boothSizeSqft: num(fd.get('boothSizeSqft')),
			monthlyRentCents: dollarsToCents(fd.get('monthlyRent')),
			customCabinetRentCents: dollarsToCents(fd.get('customCabinetRent')),
			standardDiscountPercent: num(fd.get('standardDiscountPercent')),
			maxDiscountPercent: maxDiscountRaw !== null ? maxDiscountRaw.toFixed(2) : null,
			preferredPayoutMethod: text(fd.get('preferredPayoutMethod')),
			startDate: text(fd.get('startDate')),
			notes: text(fd.get('notes'))
		};

		let result;
		try {
			result = await onboardVendor(input, locals.user!.id);
		} catch (e) {
			log.error({ error: String(e) }, 'Onboarding failed');
			return fail(500, {
				error: e instanceof Error ? e.message : 'Failed to onboard vendor'
			});
		}

		// Land on the new vendor with a banner pointing at print / upload / task.
		throw redirect(303, `/admin/vendors/${result.vendorId}?onboarded=${result.agreementId}&task=${result.taskId}`);
	}
};
