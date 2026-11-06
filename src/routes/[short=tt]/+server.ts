/**
 * /TT (any casing) — easy-to-type short link to the staff Training hub.
 * Signed-in users go straight there; anyone else signs in first and is then
 * returned to /training (the after_login cookie is consumed by /dashboard).
 * /TT?v=<slug> jumps to one resource.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	const v = url.searchParams.get('v');
	const target = '/training' + (v ? `#${encodeURIComponent(v)}` : '');
	if (locals.user) throw redirect(302, target);
	cookies.set('after_login', target, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 60 * 15 });
	throw redirect(302, '/login');
};
