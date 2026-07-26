import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { getSchedulableStaff } from '$lib/server/services/user-classification-service';

/**
 * GET /api/staff — machine-to-machine staff roster for external systems
 * (ListFlow pulls this to build its listing-agent list for eBay commission
 * tracking). Returns active staff-side users (admins included, vendor-type
 * users excluded), same population as scheduling.
 */
export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	const apiKey = authHeader?.replace('Bearer ', '');

	if (!apiKey || apiKey !== CRON_SECRET) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const staff = await getSchedulableStaff();
	return json(
		staff.map((person) => ({
			id: person.id,
			name: person.name,
			active: true
		}))
	);
};
