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
	version: string | null;
}

/** Pull a semver (e.g. 0.11.0) out of an installer filename, if present. */
export function parseVersion(file: string): string | null {
	const m = file.match(/[_-](\d+\.\d+\.\d+)(?:[._-]|$)/);
	return m ? m[1] : null;
}

function semverDesc(a: string, b: string): number {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
	}
	return 0;
}

/** Highest version among the staged installers (they're normally all the same). */
export function currentVersion(): string | null {
	const versions = listInstallers()
		.map((i) => i.version)
		.filter((v): v is string => v !== null);
	if (!versions.length) return null;
	return versions.sort(semverDesc)[0];
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
		out.push({ file: f, os: rule.os, label: rule.label, sizeMB, version: parseVersion(f) });
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

// ── Archived (older) versions ─────────────────────────────────────────────
// Each ship moves the previous version's files into `archive-<version>/` under
// the downloads dir. The vendor listing only reads the top level, so archives
// are invisible to vendors; they're exposed only through the manager-gated
// /admin/app-versions page for rollback / handing a vendor a specific old build.

export interface ArchivedVersion {
	/** Version string, e.g. "0.10.3". */
	version: string;
	/** Archive subdir name, e.g. "archive-0.10.3" — the download-URL path segment. */
	dir: string;
	files: InstallerFile[];
}

const ARCHIVE_DIR_RE = /^archive-[\w.\-]+$/;

/** Archived versions (newest first), each with its installer files. */
export function listArchivedVersions(): ArchivedVersion[] {
	const base = downloadsDir();
	if (!existsSync(base)) return [];
	const out: ArchivedVersion[] = [];
	for (const entry of readdirSync(base)) {
		const m = entry.match(/^archive-(.+)$/);
		if (!m) continue;
		const sub = join(base, entry);
		if (!statSync(sub).isDirectory()) continue;
		const files: InstallerFile[] = [];
		for (const f of readdirSync(sub)) {
			const rule = RULES.find((r) => r.test.test(f));
			if (!rule) continue;
			const sizeMB = Math.round((statSync(join(sub, f)).size / 1048576) * 10) / 10;
			files.push({ file: f, os: rule.os, label: rule.label, sizeMB, version: parseVersion(f) });
		}
		if (!files.length) continue;
		files.sort(
			(a, b) => OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os) || a.label.localeCompare(b.label)
		);
		out.push({ version: m[1], dir: entry, files });
	}
	return out.sort((a, b) => semverDesc(a.version, b.version));
}

/** Guard for the admin archived-download endpoint — no path traversal. */
export function isValidArchivedFile(dir: string, file: string): boolean {
	if (!ARCHIVE_DIR_RE.test(dir)) return false;
	if (!file || basename(file) !== file) return false;
	return listArchivedVersions().some(
		(v) => v.dir === dir && v.files.some((f) => f.file === file)
	);
}

/** Absolute path of an archived installer (validate with isValidArchivedFile first). */
export function archivedFilePath(dir: string, file: string): string {
	return join(downloadsDir(), dir, file);
}
