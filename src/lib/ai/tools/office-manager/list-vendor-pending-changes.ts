// List Vendor Pending Inventory Changes Tool - Read-only view of vendor portal proposals
import { db, vendors, pendingInventoryChanges } from '$lib/server/db';
import { and, desc, eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:list-vendor-pending-changes');

type ChangeStatus = 'pending' | 'applied' | 'rejected';

interface ListVendorPendingChangesParams {
	vendorId?: string;
	status?: ChangeStatus;
	limit?: number;
}

interface PendingChangeRow {
	id: string;
	vendorId: string;
	vendorName: string;
	partNumber: string;
	changeType: string;
	partName: string | null;
	priceCents: number | null;
	submittedAt: string;
	status: string;
}

interface ListVendorPendingChangesResult {
	success: boolean;
	rows: PendingChangeRow[];
	totalCount: number;
	error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES: ChangeStatus[] = ['pending', 'applied', 'rejected'];

export const listVendorPendingChangesTool: AITool<ListVendorPendingChangesParams, ListVendorPendingChangesResult> = {
	name: 'list_vendor_pending_changes',
	description: 'List vendor-portal inventory change proposals (create / update / delete) waiting on staff to apply in NRS, or filter by status. Each row shows vendor name, part number, change type, proposed item name + price, status, and submitted-at. Use to answer "what\'s in the inventory queue?" or "what has booth 12 submitted lately?".',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			vendorId: {
				type: 'string',
				description: 'Optional. Restrict to one vendor (TeamTime UUID).'
			},
			status: {
				type: 'string',
				description: 'Filter by status. Default "pending".',
				enum: ['pending', 'applied', 'rejected']
			},
			limit: {
				type: 'number',
				description: 'Max rows. Default 20, hard cap 200.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: ListVendorPendingChangesParams) {
		if (params.vendorId && !UUID_RE.test(params.vendorId)) {
			return { valid: false, error: 'vendorId must be a valid UUID' };
		}
		if (params.status && !VALID_STATUSES.includes(params.status)) {
			return { valid: false, error: `status must be one of ${VALID_STATUSES.join(', ')}` };
		}
		if (params.limit !== undefined && (typeof params.limit !== 'number' || params.limit < 1)) {
			return { valid: false, error: 'limit must be a positive number' };
		}
		return { valid: true };
	},

	async execute(params: ListVendorPendingChangesParams, _context: ToolExecutionContext): Promise<ListVendorPendingChangesResult> {
		try {
			const status: ChangeStatus = params.status ?? 'pending';
			const limit = Math.min(params.limit ?? 20, 200);

			const whereClauses = [eq(pendingInventoryChanges.status, status)];
			if (params.vendorId) {
				whereClauses.push(eq(pendingInventoryChanges.vendorId, params.vendorId));
			}

			const rows = await db
				.select({
					id: pendingInventoryChanges.id,
					vendorId: pendingInventoryChanges.vendorId,
					vendorName: vendors.displayName,
					partNumber: pendingInventoryChanges.partNumber,
					changeType: pendingInventoryChanges.changeType,
					payload: pendingInventoryChanges.payload,
					submittedAt: pendingInventoryChanges.submittedAt,
					status: pendingInventoryChanges.status
				})
				.from(pendingInventoryChanges)
				.innerJoin(vendors, eq(pendingInventoryChanges.vendorId, vendors.id))
				.where(and(...whereClauses))
				.orderBy(desc(pendingInventoryChanges.submittedAt))
				.limit(limit);

			const result: PendingChangeRow[] = rows.map(r => {
				const payload = (r.payload ?? {}) as { partName?: string; priceCents?: number };
				return {
					id: r.id,
					vendorId: r.vendorId,
					vendorName: r.vendorName,
					partNumber: r.partNumber,
					changeType: r.changeType,
					partName: typeof payload.partName === 'string' ? payload.partName : null,
					priceCents: typeof payload.priceCents === 'number' ? payload.priceCents : null,
					submittedAt: r.submittedAt.toISOString(),
					status: r.status
				};
			});

			return {
				success: true,
				rows: result,
				totalCount: result.length
			};
		} catch (error) {
			log.error({ error }, 'List vendor pending changes tool error');
			return {
				success: false,
				rows: [],
				totalCount: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ListVendorPendingChangesResult): string {
		if (!result.success) {
			return `Failed to list pending vendor changes: ${result.error}`;
		}
		if (result.rows.length === 0) {
			return 'No vendor inventory changes match.';
		}

		const lines = [`Found ${result.totalCount} vendor inventory change(s):`, ''];
		for (const r of result.rows) {
			const price = r.priceCents !== null ? `$${(r.priceCents / 100).toFixed(2)}` : '-';
			const submitted = r.submittedAt.replace('T', ' ').replace(/:\d\d\.\d+Z$/, '');
			const name = r.partName || '(no name)';
			lines.push(`- [${r.status}] ${r.changeType.toUpperCase()} ${r.partNumber} — ${name} @ ${price}`);
			lines.push(`    vendor: ${r.vendorName}, submitted: ${submitted}`);
		}
		return lines.join('\n');
	}
};
