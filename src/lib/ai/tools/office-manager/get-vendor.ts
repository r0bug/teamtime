// Get Vendor Tool - Read-only detailed view of a single booth vendor
import { db, vendors, pendingInventoryChanges, vendorAgreements } from '$lib/server/db';
import { and, eq, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:get-vendor');

interface GetVendorParams {
	vendorId?: string;
	boothNumber?: string;
	nrsVendorCode?: string; // resolved against vendors.inventoryCodePrefix
}

interface VendorDetail {
	id: string;
	nrsVendorId: number | null;
	inventoryCodePrefix: string | null;
	userId: string | null;
	displayName: string;
	contactName: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	boothNumber: string | null;
	monthlyRentCents: number | null;
	maxDiscountPercent: string | null;
	vendorPaymentPercent: string | null;
	status: string;
	startDate: string | null;
	endDate: string | null;
	notes: string | null;
	portalEnabled: boolean;
	onboardingComplete: boolean;
	nrsInactive: boolean;
	hasUserAccount: boolean;
	pendingInventoryChangeCount: number;
	signedAgreementCount: number;
	createdAt: string;
	updatedAt: string;
}

interface GetVendorResult {
	success: boolean;
	vendor?: VendorDetail;
	error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getVendorTool: AITool<GetVendorParams, GetVendorResult> = {
	name: 'get_vendor',
	description: 'Fetch one vendor by id, booth number, or NRS vendor code (the per-vendor SKU prefix like "SR"). Returns full vendor record plus portal access state, count of pending inventory changes, and count of signed agreements. Use when staff asks "tell me about booth 12" or "what\'s the deal with vendor SR".',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			vendorId: {
				type: 'string',
				description: 'TeamTime vendor UUID.'
			},
			boothNumber: {
				type: 'string',
				description: 'Booth number string (exact match).'
			},
			nrsVendorCode: {
				type: 'string',
				description: 'Per-vendor inventory code prefix (e.g. "SR"). Case-insensitive.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: false,

	validate(params: GetVendorParams) {
		if (!params.vendorId && !params.boothNumber && !params.nrsVendorCode) {
			return { valid: false, error: 'Must provide one of: vendorId, boothNumber, or nrsVendorCode' };
		}
		if (params.vendorId && !UUID_RE.test(params.vendorId)) {
			return { valid: false, error: 'vendorId must be a valid UUID' };
		}
		return { valid: true };
	},

	async execute(params: GetVendorParams, _context: ToolExecutionContext): Promise<GetVendorResult> {
		try {
			const whereClauses = [];
			if (params.vendorId) {
				whereClauses.push(eq(vendors.id, params.vendorId));
			} else if (params.boothNumber) {
				whereClauses.push(eq(vendors.boothNumber, params.boothNumber));
			} else if (params.nrsVendorCode) {
				whereClauses.push(sql`upper(${vendors.inventoryCodePrefix}) = upper(${params.nrsVendorCode})`);
			}

			const [row] = await db
				.select()
				.from(vendors)
				.where(and(...whereClauses))
				.limit(1);

			if (!row) {
				return {
					success: false,
					error: 'Vendor not found.'
				};
			}

			// Pending inventory change count (status = pending)
			const [pendingResult] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(pendingInventoryChanges)
				.where(
					and(
						eq(pendingInventoryChanges.vendorId, row.id),
						eq(pendingInventoryChanges.status, 'pending')
					)
				);

			// Signed agreement count
			const [signedResult] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(vendorAgreements)
				.where(
					and(
						eq(vendorAgreements.vendorId, row.id),
						eq(vendorAgreements.status, 'signed')
					)
				);

			const detail: VendorDetail = {
				id: row.id,
				nrsVendorId: row.nrsVendorId,
				inventoryCodePrefix: row.inventoryCodePrefix,
				userId: row.userId,
				displayName: row.displayName,
				contactName: row.contactName,
				contactEmail: row.contactEmail,
				contactPhone: row.contactPhone,
				boothNumber: row.boothNumber,
				monthlyRentCents: row.monthlyRentCents,
				maxDiscountPercent: row.maxDiscountPercent,
				vendorPaymentPercent: row.vendorPaymentPercent,
				status: row.status,
				startDate: row.startDate,
				endDate: row.endDate,
				notes: row.notes,
				portalEnabled: row.portalEnabled,
				onboardingComplete: row.onboardingComplete,
				nrsInactive: row.nrsInactive,
				hasUserAccount: row.userId !== null,
				pendingInventoryChangeCount: Number(pendingResult?.count ?? 0),
				signedAgreementCount: Number(signedResult?.count ?? 0),
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString()
			};

			return { success: true, vendor: detail };
		} catch (error) {
			log.error({ error }, 'Get vendor tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: GetVendorResult): string {
		if (!result.success || !result.vendor) {
			return `Failed to get vendor: ${result.error || 'Unknown error'}`;
		}
		const v = result.vendor;
		const lines: string[] = [];
		lines.push(`Vendor: ${v.displayName}`);
		lines.push(`  Booth: ${v.boothNumber || '-'}`);
		lines.push(`  Status: ${v.status}${v.nrsInactive ? ' (NRS marked inactive)' : ''}`);
		lines.push(`  NRS vendor id: ${v.nrsVendorId ?? '-'}`);
		lines.push(`  Inventory code prefix: ${v.inventoryCodePrefix ?? '-'}`);
		lines.push(`  Monthly rent: ${v.monthlyRentCents !== null ? `$${(v.monthlyRentCents / 100).toFixed(2)}` : '-'}`);
		lines.push(`  Vendor payment %: ${v.vendorPaymentPercent ? `${parseFloat(v.vendorPaymentPercent).toFixed(2)}%` : '-'}`);
		lines.push(`  Max discount %: ${v.maxDiscountPercent ? `${parseFloat(v.maxDiscountPercent).toFixed(2)}%` : '-'}`);
		lines.push('');
		lines.push('Contact:');
		lines.push(`  Name: ${v.contactName || '-'}`);
		lines.push(`  Email: ${v.contactEmail || '-'}`);
		lines.push(`  Phone: ${v.contactPhone || '-'}`);
		lines.push('');
		lines.push('Lifecycle:');
		lines.push(`  Start: ${v.startDate || '-'}`);
		lines.push(`  End: ${v.endDate || '-'}`);
		lines.push('');
		lines.push('Portal & onboarding:');
		lines.push(`  Has TeamTime user account: ${v.hasUserAccount ? 'yes' : 'no'}`);
		lines.push(`  Portal enabled: ${v.portalEnabled ? 'yes' : 'no'}`);
		lines.push(`  Onboarding complete: ${v.onboardingComplete ? 'yes' : 'no'}`);
		lines.push('');
		lines.push('Activity:');
		lines.push(`  Pending inventory changes: ${v.pendingInventoryChangeCount}`);
		lines.push(`  Signed agreements: ${v.signedAgreementCount}`);
		if (v.notes) {
			lines.push('');
			lines.push('Notes:');
			lines.push(`  ${v.notes.replace(/\n/g, '\n  ')}`);
		}
		return lines.join('\n');
	}
};
