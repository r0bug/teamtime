import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { findValidToken, redeemResetToken } from '$lib/server/auth/password-reset';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) throw redirect(302, '/dashboard');
	const token = url.searchParams.get('token') ?? '';
	const valid = token ? (await findValidToken(token)) !== null : false;
	return { token, valid };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const token = (data.get('token') as string) ?? '';
		const password = (data.get('password') as string) ?? '';
		const confirm = (data.get('confirm') as string) ?? '';

		if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters' });
		if (password !== confirm) return fail(400, { error: 'Passwords do not match' });

		const result = await redeemResetToken(token, password);
		if (!result.ok) return fail(400, { error: result.reason ?? 'Reset failed' });

		return { success: true };
	}
};
