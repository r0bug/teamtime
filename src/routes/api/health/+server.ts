// Health Check Endpoint - No auth required (for external monitoring tools)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import fs from 'fs';

const startTime = Date.now();

export const GET: RequestHandler = async () => {
	const checks: Record<string, boolean> = {};
	let status: 'ok' | 'degraded' | 'down' = 'ok';

	// Check database connectivity
	try {
		await db.execute(sql`SELECT 1`);
		checks.db = true;
	} catch {
		checks.db = false;
		status = 'down';
	}

	// Check disk space (basic check via statfs)
	try {
		const stats = fs.statfsSync('/');
		const freeBytes = stats.bfree * stats.bsize;
		const freeGB = freeBytes / (1024 * 1024 * 1024);
		checks.disk = freeGB > 1; // Degraded if < 1GB free
		if (!checks.disk && status === 'ok') {
			status = 'degraded';
		}
	} catch {
		checks.disk = true; // Don't fail health check if statfs unavailable
	}

	const uptimeMs = Date.now() - startTime;

	return json({
		status,
		db: checks.db,
		disk: checks.disk,
		uptime: Math.floor(uptimeMs / 1000),
		version: '1.0.0-alpha',
		timestamp: new Date().toISOString()
	});
};
