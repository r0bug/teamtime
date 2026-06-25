/**
 * Serves the desktop app's auto-update manifest + signed bundles staged on the
 * box at APP_UPDATES_DIR (default ~/teamtime-app-updates). PUBLIC (the app
 * checks for updates before login) and read-only; filenames are whitelisted
 * against the directory listing so there's no path traversal.
 *
 * To publish an update: `gh release download <tag>` the signed bundles + .sig
 * into that dir, then run scripts/build-update-manifest.sh to write latest.json.
 */
import { readdirSync, existsSync } from 'fs';
import { basename, join } from 'path';
import { homedir } from 'os';
import { env } from '$env/dynamic/private';

export function updatesDir(): string {
	return env.APP_UPDATES_DIR || join(homedir(), 'teamtime-app-updates');
}

/** Only serve a plain filename that actually exists in the updates dir. */
export function isValidUpdateFile(file: string): boolean {
	if (!file || basename(file) !== file) return false;
	const dir = updatesDir();
	if (!existsSync(dir)) return false;
	return readdirSync(dir).includes(file);
}
