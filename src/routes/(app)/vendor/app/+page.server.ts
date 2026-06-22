import type { PageServerLoad } from './$types';
import { listInstallers } from '$lib/server/services/app-downloads';

// Access is gated by the /vendor layout (vendor portal users only).
export const load: PageServerLoad = async () => {
	const installers = listInstallers();
	const byOs = {
		Windows: installers.filter((i) => i.os === 'Windows'),
		macOS: installers.filter((i) => i.os === 'macOS'),
		Linux: installers.filter((i) => i.os === 'Linux')
	};
	return { byOs, count: installers.length };
};
