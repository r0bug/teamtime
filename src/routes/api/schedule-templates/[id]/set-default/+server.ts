import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { setDefaultTemplate, getTemplate } from '$lib/server/services/schedule-template-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:schedule-templates:set-default');

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	try {
		await setDefaultTemplate(params.id);
		const template = await getTemplate(params.id);
		return json({ template });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.toLowerCase().includes('not found')) {
			return json({ error: msg }, { status: 404 });
		}
		log.error({ err, id: params.id }, 'Failed to set default schedule template');
		return json({ error: msg }, { status: 500 });
	}
};
