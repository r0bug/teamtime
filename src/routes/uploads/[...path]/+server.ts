import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = './uploads';

const MIME_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp'
};

export const GET: RequestHandler = async ({ params }) => {
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

	try {
		// Check if file exists
		await stat(fullPath);

		// Read file
		const fileBuffer = await readFile(fullPath);

		// Determine content type
		const ext = path.extname(fullPath).toLowerCase();
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (e) {
		throw error(404, 'File not found');
	}
};
