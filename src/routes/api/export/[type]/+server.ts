// Generic Export Endpoint
// GET /api/export/time-entries?format=csv&start=2024-01-01&end=2024-12-31
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	exportTimeEntries,
	exportTasks,
	formatExport,
	getContentType,
	getFileExtension,
	EXPORT_TYPES,
	type ExportFormat,
	type ExportType
} from '$lib/server/services/export-service';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	// Require manager+ permission
	if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'manager')) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const exportType = params.type as ExportType;
	if (!EXPORT_TYPES.includes(exportType)) {
		return json({ error: `Invalid export type. Valid: ${EXPORT_TYPES.join(', ')}` }, { status: 400 });
	}

	const format = (url.searchParams.get('format') || 'csv') as ExportFormat;
	if (format !== 'csv' && format !== 'json') {
		return json({ error: 'Format must be csv or json' }, { status: 400 });
	}

	const startStr = url.searchParams.get('start');
	const endStr = url.searchParams.get('end');
	const startDate = startStr ? new Date(startStr) : undefined;
	const endDate = endStr ? new Date(endStr) : undefined;

	let rows: Record<string, unknown>[];

	switch (exportType) {
		case 'time-entries':
			rows = await exportTimeEntries({ format, startDate, endDate });
			break;
		case 'tasks':
			rows = await exportTasks({ format, startDate, endDate });
			break;
		default:
			return json({ error: 'Unknown export type' }, { status: 400 });
	}

	const body = formatExport(rows, format);
	const ext = getFileExtension(format);
	const filename = `${exportType}_${new Date().toISOString().split('T')[0]}.${ext}`;

	return new Response(body, {
		headers: {
			'Content-Type': getContentType(format),
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
