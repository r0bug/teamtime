import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Minimal config for running the designer under vite-node. We deliberately do
// NOT load the project's SvelteKit plugin (it throws "impossible situation"
// outside vite build/dev). We only need to resolve the `$lib` alias and shim
// the `$env` virtual modules the imported server code expects.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
	resolve: {
		alias: {
			$lib: resolve(root, 'src/lib'),
			'$env/static/private': resolve(root, 'tools/label-designer/env-shim.ts'),
			'$env/dynamic/private': resolve(root, 'tools/label-designer/env-shim.ts')
		}
	}
});
