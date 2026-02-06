// Export Service - CSV/JSON export for various entity types
import { db, timeEntries, tasks, taskCompletions, users } from '$lib/server/db';
import { and, gte, lte, eq, desc } from 'drizzle-orm';

export type ExportFormat = 'csv' | 'json';

interface ExportOptions {
	startDate?: Date;
	endDate?: Date;
	format: ExportFormat;
}

function toCSV(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) return '';
	const headers = Object.keys(rows[0]);
	const lines = [headers.join(',')];
	for (const row of rows) {
		const values = headers.map(h => {
			const val = row[h];
			if (val === null || val === undefined) return '';
			const str = String(val);
			// Escape CSV values containing commas, quotes, or newlines
			if (str.includes(',') || str.includes('"') || str.includes('\n')) {
				return `"${str.replace(/"/g, '""')}"`;
			}
			return str;
		});
		lines.push(values.join(','));
	}
	return lines.join('\n');
}

export function formatExport(rows: Record<string, unknown>[], format: ExportFormat): string {
	if (format === 'json') return JSON.stringify(rows, null, 2);
	return toCSV(rows);
}

export function getContentType(format: ExportFormat): string {
	return format === 'json' ? 'application/json' : 'text/csv';
}

export function getFileExtension(format: ExportFormat): string {
	return format === 'json' ? 'json' : 'csv';
}

export async function exportTimeEntries(opts: ExportOptions) {
	const conditions = [];
	if (opts.startDate) conditions.push(gte(timeEntries.clockIn, opts.startDate));
	if (opts.endDate) conditions.push(lte(timeEntries.clockIn, opts.endDate));

	const rows = await db
		.select({
			id: timeEntries.id,
			userId: timeEntries.userId,
			userName: users.name,
			clockIn: timeEntries.clockIn,
			clockOut: timeEntries.clockOut,
			notes: timeEntries.notes,
			createdAt: timeEntries.createdAt
		})
		.from(timeEntries)
		.leftJoin(users, eq(timeEntries.userId, users.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(timeEntries.clockIn))
		.limit(10000);

	return rows.map(r => ({
		...r,
		clockIn: r.clockIn?.toISOString(),
		clockOut: r.clockOut?.toISOString(),
		createdAt: r.createdAt?.toISOString()
	}));
}

export async function exportTasks(opts: ExportOptions) {
	const conditions = [];
	if (opts.startDate) conditions.push(gte(tasks.createdAt, opts.startDate));
	if (opts.endDate) conditions.push(lte(tasks.createdAt, opts.endDate));

	const rows = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			description: tasks.description,
			status: tasks.status,
			priority: tasks.priority,
			assignedTo: tasks.assignedTo,
			dueAt: tasks.dueAt,
			createdAt: tasks.createdAt
		})
		.from(tasks)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(tasks.createdAt))
		.limit(10000);

	return rows.map(r => ({
		...r,
		dueAt: r.dueAt?.toISOString(),
		createdAt: r.createdAt?.toISOString()
	}));
}

export const EXPORT_TYPES = ['time-entries', 'tasks'] as const;
export type ExportType = typeof EXPORT_TYPES[number];
