import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import {
	listFormats,
	createFormat,
	updateFormat,
	archiveFormat,
	unarchiveFormat,
	LabelFormatError,
	type LabelFormatInput
} from '$lib/server/services/label-format-service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isManager(locals.user)) throw redirect(302, '/dashboard');
	const formats = await listFormats({ includeInactive: true });
	return { formats };
};

function readInput(data: FormData): LabelFormatInput {
	const num = (k: string): number | null => {
		const raw = (data.get(k) as string)?.trim();
		if (!raw) return null;
		const n = parseFloat(raw);
		return isFinite(n) ? n : null;
	};
	const intVal = (k: string): number | null => {
		const raw = (data.get(k) as string)?.trim();
		if (!raw) return null;
		const n = parseInt(raw, 10);
		return isFinite(n) ? n : null;
	};

	return {
		code: ((data.get('code') as string) ?? '').trim().toLowerCase(),
		name: ((data.get('name') as string) ?? '').trim(),
		layout: ((data.get('layout') as string) ?? 'sheet') as 'sheet' | 'thermal',
		labelWidthInches: num('labelWidthInches') ?? 0,
		labelHeightInches: num('labelHeightInches') ?? 0,
		pageWidthInches: num('pageWidthInches'),
		pageHeightInches: num('pageHeightInches'),
		cols: intVal('cols'),
		rows: intVal('rows'),
		marginTopInches: num('marginTopInches'),
		marginLeftInches: num('marginLeftInches'),
		verticalPitchInches: num('verticalPitchInches'),
		horizontalPitchInches: num('horizontalPitchInches')
	};
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const input = readInput(await request.formData());
		try {
			await createFormat(input);
		} catch (err) {
			if (err instanceof LabelFormatError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'create' };
	},
	update: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		try {
			await updateFormat(id, readInput(data));
		} catch (err) {
			if (err instanceof LabelFormatError) return fail(400, { error: err.message });
			throw err;
		}
		return { success: 'update' };
	},
	archive: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const id = (await request.formData()).get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		await archiveFormat(id);
		return { success: 'archive' };
	},
	unarchive: async ({ locals, request }) => {
		if (!isManager(locals.user)) return fail(403, { error: 'Not authorized' });
		const id = (await request.formData()).get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		await unarchiveFormat(id);
		return { success: 'unarchive' };
	}
};
