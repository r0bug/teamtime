import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { asc } from 'drizzle-orm';
import { db, vendors } from '$lib/server/db';
import {
	listPrinters,
	createPrinter,
	updatePrinter,
	checkoutPrinter,
	returnPrinter,
	PrinterCheckoutError,
	type PrinterInput
} from '$lib/server/services/printer-service';
import { listFormats } from '$lib/server/services/label-format-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	const [printerList, formats, vendorList] = await Promise.all([
		listPrinters(),
		listFormats(),
		db
			.select({ id: vendors.id, name: vendors.displayName })
			.from(vendors)
			.orderBy(asc(vendors.displayName))
	]);
	// Thermal formats are the ones a Zebra can have loaded.
	const thermalFormats = formats.filter((f) => f.category === 'thermal' && f.isActive);
	return { printers: printerList, formats: thermalFormats, vendors: vendorList };
};

function readPrinter(data: FormData): PrinterInput {
	const intVal = (k: string): number | null => {
		const raw = (data.get(k) as string)?.trim();
		if (!raw) return null;
		const n = parseInt(raw, 10);
		return isFinite(n) ? n : null;
	};
	return {
		name: ((data.get('name') as string) ?? '').trim(),
		kind: ((data.get('kind') as string) || 'shop_network').trim(),
		model: ((data.get('model') as string) || '').trim() || null,
		dpi: intVal('dpi'),
		networkAddress: ((data.get('networkAddress') as string) || '').trim() || null,
		preferredFormatCode: ((data.get('preferredFormatCode') as string) || '').trim() || null,
		location: ((data.get('location') as string) || '').trim() || null,
		active: data.get('active') != null
	};
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const input = readPrinter(await request.formData());
		if (!input.name) return fail(400, { error: 'Printer name is required' });
		try {
			await createPrinter(input);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Create failed' });
		}
		return { success: 'create' };
	},
	update: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		try {
			await updatePrinter(id, readPrinter(data));
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Update failed' });
		}
		return { success: 'update' };
	},
	checkout: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const id = data.get('id') as string;
		const vendorId = data.get('vendorId') as string;
		const loadedFormatCode = data.get('loadedFormatCode') as string;
		if (!id || !vendorId || !loadedFormatCode) {
			return fail(400, { error: 'Printer, vendor, and loaded label are all required' });
		}
		try {
			await checkoutPrinter(id, { vendorId, loadedFormatCode });
		} catch (err) {
			if (err instanceof PrinterCheckoutError) return fail(err.status, { error: err.message });
			throw err;
		}
		return { success: 'checkout' };
	},
	checkin: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const id = (await request.formData()).get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		try {
			await returnPrinter(id);
		} catch (err) {
			if (err instanceof PrinterCheckoutError) return fail(err.status, { error: err.message });
			throw err;
		}
		return { success: 'checkin' };
	}
};
