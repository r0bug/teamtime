/**
 * Serves the desktop label-app installers that staff stage on the box at
 * APP_DOWNLOADS_DIR (default ~/teamtime-app-downloads). Vendors download them
 * from the portal (behind login) instead of needing GitHub access.
 *
 * To publish a new app version: drop the new installer files in that directory
 * (replacing the old ones) — no code change or redeploy needed.
 */
import { readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { env } from '$env/dynamic/private';

export function downloadsDir(): string {
	return env.APP_DOWNLOADS_DIR || join(homedir(), 'teamtime-app-downloads');
}

export interface InstallerFile {
	file: string;
	os: 'Windows' | 'macOS' | 'Linux';
	label: string;
	sizeMB: number;
}

const RULES: { test: RegExp; os: InstallerFile['os']; label: string }[] = [
	{ test: /-setup\.exe$/i, os: 'Windows', label: 'Windows installer (.exe)' },
	{ test: /\.msi$/i, os: 'Windows', label: 'Windows installer (.msi)' },
	{ test: /aarch64\.dmg$/i, os: 'macOS', label: 'macOS — Apple Silicon (.dmg)' },
	{ test: /x64\.dmg$/i, os: 'macOS', label: 'macOS — Intel (.dmg)' },
	{ test: /\.AppImage$/i, os: 'Linux', label: 'Linux portable (.AppImage)' },
	{ test: /amd64\.deb$/i, os: 'Linux', label: 'Linux — Debian / Ubuntu (.deb)' },
	{ test: /\.rpm$/i, os: 'Linux', label: 'Linux — Fedora / RHEL (.rpm)' }
];

const OS_ORDER: InstallerFile['os'][] = ['Windows', 'macOS', 'Linux'];

export function listInstallers(): InstallerFile[] {
	const dir = downloadsDir();
	if (!existsSync(dir)) return [];
	const out: InstallerFile[] = [];
	for (const f of readdirSync(dir)) {
		const rule = RULES.find((r) => r.test.test(f));
		if (!rule) continue;
		const sizeMB = Math.round((statSync(join(dir, f)).size / 1048576) * 10) / 10;
		out.push({ file: f, os: rule.os, label: rule.label, sizeMB });
	}
	return out.sort(
		(a, b) => OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os) || a.label.localeCompare(b.label)
	);
}

/** Guard: only serve a plain filename that is one of the listed installers. */
export function isValidInstaller(file: string): boolean {
	if (!file || basename(file) !== file) return false;
	return listInstallers().some((i) => i.file === file);
}
