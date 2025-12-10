// Office Manager Chat Page Server
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { listChatSessions } from '$lib/ai/office-manager/chat';

export const load: PageServerLoad = async ({ locals }) => {
	// Require manager or admin role
	if (!isManager(locals.user)) {
		throw redirect(302, '/dashboard');
	}

	// Get user's chat sessions - user is guaranteed to exist after isManager check
	const sessions = await listChatSessions(locals.user!.id, 20);

	return {
		user: locals.user,
		chatSessions: sessions.map(s => ({
			id: s.id,
			title: s.title,
			messageCount: s.messages.length,
			createdAt: s.createdAt.toISOString(),
			updatedAt: s.updatedAt.toISOString()
		}))
	};
};
