import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:uploads');

const UPLOAD_DIR = './uploads';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
	'image/jpeg',
	'image/jpg', // Some mobile browsers report this
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic', // iPhone photos
	'image/heif' // iPhone photos
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'];

function isValidImageFile(file: File): boolean {
	// Check MIME type first
	if (file.type && ALLOWED_TYPES.includes(file.type.toLowerCase())) {
		return true;
	}
	// Fall back to extension check (some mobile browsers don't set MIME type correctly)
	const ext = path.extname(file.name).toLowerCase();
	if (ALLOWED_EXTENSIONS.includes(ext)) {
		return true;
	}
	// Also accept if it starts with 'image/' (permissive for mobile)
	if (file.type && file.type.startsWith('image/')) {
		return true;
	}
	return false;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;

		if (!file) {
			log.warn('No file in form data');
			return json({ error: 'No file provided' }, { status: 400 });
		}

		// Log file details for debugging
		log.info({ fileName: file.name, fileType: file.type, fileSize: file.size }, 'Upload attempt');

		// Validate file type (more permissive for mobile)
		if (!isValidImageFile(file)) {
			log.warn({ fileType: file.type, fileName: file.name }, 'Invalid file type rejected');
			return json({ error: `Invalid file type: ${file.type || 'unknown'}. Only images are allowed.` }, { status: 400 });
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE) {
			return json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
		}

		// Create upload directory if it doesn't exist
		const dateDir = new Date().toISOString().split('T')[0];
		const uploadPath = path.join(UPLOAD_DIR, dateDir);

		if (!existsSync(uploadPath)) {
			await mkdir(uploadPath, { recursive: true });
		}

		// Generate unique filename
		const ext = path.extname(file.name) || '.jpg';
		const filename = `${uuidv4()}${ext}`;
		const filePath = path.join(uploadPath, filename);
		const relativePath = path.join(dateDir, filename);

		// Write file
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(filePath, buffer);

		return json({
			success: true,
			file: {
				filePath: `/uploads/${relativePath}`,
				originalName: file.name,
				mimeType: file.type,
				sizeBytes: file.size
			}
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error({ error: errorMessage, stack: error instanceof Error ? error.stack : undefined }, 'Upload error');

		// Provide more specific error messages
		if (errorMessage.includes('ENOSPC')) {
			return json({ error: 'Server storage is full' }, { status: 507 });
		}
		if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
			return json({ error: 'Server permission error' }, { status: 500 });
		}
		if (errorMessage.includes('payload') || errorMessage.includes('body') || errorMessage.includes('size')) {
			return json({ error: 'File too large for upload' }, { status: 413 });
		}

		return json({ error: 'Upload failed. Please try again.' }, { status: 500 });
	}
};
