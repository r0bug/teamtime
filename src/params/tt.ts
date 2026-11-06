import type { ParamMatcher } from '@sveltejs/kit';

/** /TT short link, any casing (/TT, /tt, /Tt). */
export const match: ParamMatcher = (param) => /^tt$/i.test(param);
