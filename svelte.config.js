import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			out: 'build',
			precompress: true
		}),
		csrf: {
			// Allow all origins: Twilio webhooks send form-encoded POSTs without
			// Origin header, which SvelteKit blocks. All endpoints have their own auth:
			// - Browser routes: Lucia session auth
			// - Webhooks: Twilio signature validation
			// - Cron: CRON_SECRET bearer token
			trustedOrigins: ['*']
		},
		alias: {
			$lib: './src/lib',
			$components: './src/lib/components',
			$server: './src/lib/server'
		}
	}
};

export default config;
