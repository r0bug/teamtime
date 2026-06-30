import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { reportPrinter, type PrinterReport } from '$lib/server/services/printer-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:printers:report');

/**
 * POST /api/printers/report — Print Bridge discovery / heartbeat ingest.
 *
 * The Bridge probes printers (model + dpi via SGD/`~HI`) and reports them here so
 * the registry's identity + liveness stay current. TeamTime's `printers` table is
 * the source of truth; this is how the Bridge feeds it.
 *
 * Auth: shared bridge secret in a header (never a query param — those leak into
 * logs). Send `Authorization: Bearer $PRINTER_BRIDGE_SECRET` or
 * `X-Bridge-Secret: $PRINTER_BRIDGE_SECRET`.
 *
 * Body: one report or an array of them —
 *   { networkAddress: "192.168.88.22:9100", model?, dpi?, serial?, online? }
 * Upserts each by networkAddress; returns per-row { networkAddress, id, created }.
 */
function authorized(request: Request): boolean {
	const secret = env.PRINTER_BRIDGE_SECRET;
	if (!secret) {
		// No secret configured: allow in dev so local testing isn't blocked, refuse
		// in production rather than fail open.
		if (process.env.NODE_ENV !== 'production') {
			log.warn('PRINTER_BRIDGE_SECRET not configured — allowing unauthenticated access in development');
			return true;
		}
		log.error('PRINTER_BRIDGE_SECRET must be set in production');
		return false;
	}
	const auth = request.headers.get('Authorization');
	if (auth === `Bearer ${secret}`) return true;
	if (request.headers.get('X-Bridge-Secret') === secret) return true;
	return false;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!authorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const items: unknown[] = Array.isArray(body) ? body : [body];
	if (items.length === 0) return json({ error: 'No printer reports provided' }, { status: 400 });
	if (items.length > 100) return json({ error: 'Too many reports (max 100)' }, { status: 400 });

	const results: Array<{ networkAddress: string; id: string; created: boolean }> = [];
	for (const it of items) {
		const r = it as PrinterReport;
		if (!r || typeof r.networkAddress !== 'string' || !r.networkAddress.trim()) {
			return json({ error: 'each report needs a networkAddress' }, { status: 400 });
		}
		if (r.dpi != null && (!Number.isInteger(r.dpi) || r.dpi < 50 || r.dpi > 1200)) {
			return json({ error: `invalid dpi for ${r.networkAddress}` }, { status: 400 });
		}
		const res = await reportPrinter({
			networkAddress: r.networkAddress,
			model: typeof r.model === 'string' ? r.model.slice(0, 120) : undefined,
			dpi: r.dpi ?? undefined,
			serial: typeof r.serial === 'string' ? r.serial.slice(0, 120) : undefined,
			online: typeof r.online === 'boolean' ? r.online : undefined
		});
		results.push({ networkAddress: r.networkAddress, ...res });
	}

	return json({ ok: true, results });
};
