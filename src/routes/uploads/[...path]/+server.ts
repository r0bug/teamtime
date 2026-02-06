import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { readFile, stat, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

const UPLOAD_DIR = './uploads';
const THUMB_DIR = './uploads/.thumbs';

// Allowed resize widths to prevent abuse
const ALLOWED_WIDTHS = [64, 128, 256, 512, 800];

const MIME_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.heic': 'image/heic',
	'.heif': 'image/heif'
};

// Extensions that sharp can resize
const RESIZABLE = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export const GET: RequestHandler = async ({ params, url }) => {
	const filePath = params.path;

	if (!filePath) {
		throw error(404, 'File not found');
	}

	// Security: prevent directory traversal
	const normalizedPath = path.normalize(filePath);
	if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
		throw error(403, 'Access denied');
	}

	const fullPath = path.join(UPLOAD_DIR, normalizedPath);
	const ext = path.extname(fullPath).toLowerCase();
	const contentType = MIME_TYPES[ext] || 'application/octet-stream';

	// Check for resize parameter
	const widthParam = url.searchParams.get('w');
	const requestedWidth = widthParam ? parseInt(widthParam, 10) : 0;

	// If a valid width is requested and the file is resizable, serve a thumbnail
	if (requestedWidth && ALLOWED_WIDTHS.includes(requestedWidth) && RESIZABLE.includes(ext)) {
		const thumbPath = path.join(THUMB_DIR, `${requestedWidth}`, normalizedPath);

		// Serve cached thumbnail if it exists
		if (existsSync(thumbPath)) {
			const thumbBuffer = await readFile(thumbPath);
			return new Response(thumbBuffer, {
				headers: {
					'Content-Type': 'image/jpeg',
					'Cache-Control': 'public, max-age=31536000, immutable'
				}
			});
		}

		// Generate thumbnail from original
		try {
			await stat(fullPath);
			const originalBuffer = await readFile(fullPath);

			const thumbBuffer = await sharp(originalBuffer)
				.resize(requestedWidth, undefined, { withoutEnlargement: true })
				.jpeg({ quality: 80 })
				.toBuffer();

			// Cache the thumbnail to disk
			const thumbDir = path.dirname(thumbPath);
			if (!existsSync(thumbDir)) {
				await mkdir(thumbDir, { recursive: true });
			}
			// Write cache async — don't block response
			writeFile(thumbPath, thumbBuffer).catch(() => {});

			return new Response(thumbBuffer, {
				headers: {
					'Content-Type': 'image/jpeg',
					'Cache-Control': 'public, max-age=31536000, immutable'
				}
			});
		} catch {
			throw error(404, 'File not found');
		}
	}

	// Serve original file
	try {
		await stat(fullPath);
		const fileBuffer = await readFile(fullPath);

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch {
		throw error(404, 'File not found');
	}
};
