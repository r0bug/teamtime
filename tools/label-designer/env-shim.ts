// Stands in for SvelteKit's `$env/static/private` + `$env/dynamic/private`
// virtual modules when the designer runs under vite-node (no Kit build).
// The imported server code only needs DATABASE_URL.
export const DATABASE_URL = process.env.DATABASE_URL ?? '';
export const env = process.env as Record<string, string | undefined>;
