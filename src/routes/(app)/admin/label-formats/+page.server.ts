import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { isManager } from '$lib/server/auth/roles';
import { hasTechAccess, TECH } from '$lib/server/auth/tech';
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
	if (!hasTechAccess(locals, TECH.labelFormats, isManager)) throw redirect(302, '/dashboard');
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
		horizontalPitchInches: num('horizontalPitchInches'),
		mediaShape: (((data.get('mediaShape') as string) || 'rectangle').trim()) as 'rectangle' | 'barbell' | 'circle' | 'custom',
		shapeDimsJson: (() => {
			const raw = (data.get('shapeDimsJson') as string)?.trim();
			if (!raw) return null;
			try { return JSON.parse(raw); } catch { return null; }
		})(),
		mediaSensor: (((data.get('mediaSensor') as string) || '').trim() || null) as 'gap' | 'mark' | 'continuous' | null,
		category: (((data.get('category') as string) || 'sheet').trim()) as 'sheet' | 'thermal',
		manufacturer: (((data.get('manufacturer') as string) || 'custom').trim()) as 'zebra' | 'avery' | 'custom',
		partNumber: ((data.get('partNumber') as string) || '').trim() || null,
		dpi: intVal('dpi')
	};
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		if (!hasTechAccess(locals, TECH.labelFormats, isManager)) return fail(403, { error: 'Not authorized' });
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
		if (!hasTechAccess(locals, TECH.labelFormats, isManager)) return fail(403, { error: 'Not authorized' });
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
		if (!hasTechAccess(locals, TECH.labelFormats, isManager)) return fail(403, { error: 'Not authorized' });
		const id = (await request.formData()).get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		await archiveFormat(id);
		return { success: 'archive' };
	},
	unarchive: async ({ locals, request }) => {
		if (!hasTechAccess(locals, TECH.labelFormats, isManager)) return fail(403, { error: 'Not authorized' });
		const id = (await request.formData()).get('id') as string;
		if (!id) return fail(400, { error: 'id required' });
		await unarchiveFormat(id);
		return { success: 'unarchive' };
	}
};
