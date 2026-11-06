// Training resources (how-to videos etc.) shown at /training to signed-in staff.
//
// Media is NOT in the repo or the public /uploads tree: it lives in a private
// directory on the box (TRAINING_MEDIA_DIR, default <cwd>/training) next to a
// manifest.json, so adding a resource = copy the file + add a manifest entry —
// no rebuild, no deploy. Files are streamed only through the auth-gated
// /training/media/<file> endpoint (vendor numbers appear in some videos).
//
// manifest.json: [{ "slug", "title", "description", "file", "poster"?, "duration"?, "tags"? }]
import { env } from '$env/dynamic/private';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export interface TrainingResource {
	slug: string;
	title: string;
	description: string;
	file: string;
	poster: string | null;
	duration: string | null;
	tags: string[];
	sizeBytes: number;
}

export function trainingDir(): string {
	return env.TRAINING_MEDIA_DIR || path.join(process.cwd(), 'training');
}

/** Only plain file names (no dirs, no dotfiles) may be served. */
export function isSafeFileName(name: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..') && name !== 'manifest.json';
}

export async function listTrainingResources(): Promise<TrainingResource[]> {
	let raw: unknown;
	try {
		raw = JSON.parse(await readFile(path.join(trainingDir(), 'manifest.json'), 'utf8'));
	} catch {
		return [];
	}
	if (!Array.isArray(raw)) return [];
	const out: TrainingResource[] = [];
	for (const r of raw as Record<string, unknown>[]) {
		const file = typeof r.file === 'string' ? r.file : '';
		if (!isSafeFileName(file)) continue;
		const st = await stat(path.join(trainingDir(), file)).catch(() => null);
		if (!st?.isFile()) continue;
		const poster = typeof r.poster === 'string' && isSafeFileName(r.poster) ? r.poster : null;
		out.push({
			slug: typeof r.slug === 'string' ? r.slug : file,
			title: typeof r.title === 'string' ? r.title : file,
			description: typeof r.description === 'string' ? r.description : '',
			file,
			poster,
			duration: typeof r.duration === 'string' ? r.duration : null,
			tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
			sizeBytes: st.size
		});
	}
	return out;
}

/** Absolute path of a file referenced by the manifest, or null. */
export async function resolveTrainingFile(name: string): Promise<string | null> {
	if (!isSafeFileName(name)) return null;
	const list = await listTrainingResources();
	if (!list.some((r) => r.file === name || r.poster === name)) return null;
	return path.join(trainingDir(), name);
}

const MIME: Record<string, string> = {
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.pdf': 'application/pdf'
};
export function mimeFor(name: string): string {
	return MIME[path.extname(name).toLowerCase()] ?? 'application/octet-stream';
}

/** Parse a single "bytes=a-b" range against a file size; null = serve whole file. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
	if (!header) return null;
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
	let start: number, end: number;
	if (m[1] === '') {
		// suffix range: last N bytes
		const n = Number(m[2]);
		start = Math.max(0, size - n);
		end = size - 1;
	} else {
		start = Number(m[1]);
		end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
	}
	if (start > end || start >= size) return 'invalid';
	return { start, end };
}
