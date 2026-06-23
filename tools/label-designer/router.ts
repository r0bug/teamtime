import {
	renderTagSvgFromDimensions,
	renderZplFromDimensions
} from '$lib/server/services/tag-render-service';
import * as formats from '$lib/server/services/label-format-service';
import { formStateToDimensions, formStateToCtx, formStateToInput, type FormState } from './form-model';
import { buildAlignmentBorderZpl } from './zpl-border';
import { renderBarbellPreviewSvg } from './barbell-svg';
import { sendZplToPrinter, parsePrinterTarget } from './printer';

export interface Deps {
	sendZpl: (zpl: string, host: string, port: number) => Promise<void>;
	getFormatByCode: typeof formats.getFormatByCode;
	createFormat: typeof formats.createFormat;
	updateFormat: typeof formats.updateFormat;
	listFormats: typeof formats.listFormats;
}

const defaults: Deps = {
	sendZpl: (zpl, host, port) => sendZplToPrinter(zpl, host, port),
	getFormatByCode: formats.getFormatByCode,
	createFormat: formats.createFormat,
	updateFormat: formats.updateFormat,
	listFormats: formats.listFormats
};

/** Human label for the DB the tool is pointed at (host/name from DATABASE_URL). */
export function dbLabel(): string {
	const url = process.env.DATABASE_URL ?? '';
	const m = url.match(/@([^/]+)\/([^?]+)/);
	return m ? `${m[1]}/${m[2]}` : '(DATABASE_URL unset)';
}

export async function route(
	req: { method: string; path: string; body: unknown },
	deps: Partial<Deps> = {}
): Promise<{ status: number; json?: unknown; svg?: string }> {
	const d = { ...defaults, ...deps };
	try {
		if (req.method === 'GET' && req.path === '/api/db') {
			return { status: 200, json: { db: dbLabel() } };
		}
		if (req.method === 'GET' && req.path === '/api/formats') {
			return { status: 200, json: { formats: await d.listFormats({ includeInactive: true }) } };
		}
		if (req.method === 'POST' && req.path === '/api/preview') {
			const f = req.body as FormState;
			if (f.mediaShape === 'barbell') return { status: 200, svg: await renderBarbellPreviewSvg(f) };
			const svg = await renderTagSvgFromDimensions(formStateToDimensions(f), formStateToCtx(f));
			return { status: 200, svg };
		}
		if (req.method === 'POST' && req.path === '/api/test-print') {
			const { form, mode, printer } = req.body as {
				form: FormState;
				mode: 'border' | 'sample';
				printer: string;
			};
			const zpl =
				mode === 'border'
					? buildAlignmentBorderZpl({
							widthInches: form.widthIn,
							heightInches: form.heightIn,
							dpi: form.dpi,
							pads: form.mediaShape === 'barbell' ? form.pads : undefined
						})
					: renderZplFromDimensions(formStateToDimensions(form), formStateToCtx(form));
			const { host, port } = parsePrinterTarget(printer);
			await d.sendZpl(zpl, host, port);
			return { status: 200, json: { ok: true } };
		}
		if (req.method === 'POST' && req.path === '/api/save') {
			const input = formStateToInput(req.body as FormState);
			const existing = await d.getFormatByCode(input.code);
			const saved = existing ? await d.updateFormat(existing.id, input) : await d.createFormat(input);
			return { status: 200, json: { saved } };
		}
		return { status: 404, json: { error: 'not found' } };
	} catch (e) {
		return { status: 400, json: { error: e instanceof Error ? e.message : String(e) } };
	}
}
