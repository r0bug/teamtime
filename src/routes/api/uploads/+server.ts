import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = './uploads';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;

		if (!file) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		// Validate file type
		if (!ALLOWED_TYPES.includes(file.type)) {
			return json({ error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.' }, { status: 400 });
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
		console.error('Upload error:', error);
		return json({ error: 'Upload failed' }, { status: 500 });
	}
};
