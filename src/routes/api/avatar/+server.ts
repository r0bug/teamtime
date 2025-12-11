import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, users } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api:avatar');

const UPLOAD_DIR = 'static/uploads/avatars';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const formData = await request.formData();
		const file = formData.get('avatar') as File | null;
		const imageData = formData.get('imageData') as string | null;

		let buffer: Buffer;
		let ext: string;

		if (imageData) {
			// Handle base64 data URL (from paste/crop)
			const matches = imageData.match(/^data:image\/([\w+]+);base64,(.+)$/);
			if (!matches) {
				throw error(400, 'Invalid image data');
			}
			ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
			buffer = Buffer.from(matches[2], 'base64');
		} else if (file) {
			// Handle file upload
			if (!ALLOWED_TYPES.includes(file.type)) {
				throw error(400, 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP');
			}

			if (file.size > MAX_SIZE) {
				throw error(400, 'File too large. Maximum size is 5MB');
			}

			const arrayBuffer = await file.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
			ext = file.type.split('/')[1];
			if (ext === 'jpeg') ext = 'jpg';
		} else {
			throw error(400, 'No image provided');
		}

		if (buffer.length > MAX_SIZE) {
			throw error(400, 'Image too large. Maximum size is 5MB');
		}

		// Ensure upload directory exists
		if (!existsSync(UPLOAD_DIR)) {
			await mkdir(UPLOAD_DIR, { recursive: true });
		}

		// Generate unique filename
		const hash = crypto.randomBytes(16).toString('hex');
		const filename = `${locals.user.id}-${hash}.${ext}`;
		const filepath = path.join(UPLOAD_DIR, filename);

		// Save file
		await writeFile(filepath, buffer);

		// Update user's avatar URL
		const avatarUrl = `/uploads/avatars/${filename}`;
		await db
			.update(users)
			.set({ avatarUrl, updatedAt: new Date() })
			.where(eq(users.id, locals.user.id));

		return json({ success: true, avatarUrl });
	} catch (err) {
		log.error({ error: err, userId: locals.user?.id }, 'Avatar upload error');
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to upload avatar');
	}
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	await db
		.update(users)
		.set({ avatarUrl: null, updatedAt: new Date() })
		.where(eq(users.id, locals.user.id));

	return json({ success: true });
};
