// Process Inventory Photos Tool - Trigger AI processing on inventory drops
import { db, inventoryDrops } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:tools:process-inventory-photos');

interface ProcessInventoryPhotosParams {
	dropId: string;
}

interface ProcessInventoryPhotosResult {
	success: boolean;
	dropId?: string;
	status?: string;
	itemCount?: number;
	error?: string;
}

export const processInventoryPhotosTool: AITool<ProcessInventoryPhotosParams, ProcessInventoryPhotosResult> = {
	name: 'process_inventory_photos',
	description: 'Trigger AI processing on an inventory drop to identify items from photos. Use when a drop needs to be (re)processed or when manual intervention is requested.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			dropId: {
				type: 'string',
				description: 'The ID of the inventory drop to process'
			}
		},
		required: ['dropId']
	},

	requiresApproval: false,
	requiresConfirmation: true,

	cooldown: {
		perUser: 5, // Don't reprocess same drop within 5 min
		global: 2
	},
	rateLimit: {
		maxPerHour: 20
	},

	getConfirmationMessage(params: ProcessInventoryPhotosParams): string {
		return `Process inventory drop ${params.dropId.slice(0, 8)}...?\n\nThis will analyze the photos with AI to identify items.`;
	},

	validate(params: ProcessInventoryPhotosParams) {
		if (!params.dropId) {
			return { valid: false, error: 'Drop ID is required' };
		}
		return { valid: true };
	},

	async execute(params: ProcessInventoryPhotosParams, context: ToolExecutionContext): Promise<ProcessInventoryPhotosResult> {
		if (context.dryRun) {
			return {
				success: true,
				error: 'Dry run - inventory would be processed'
			};
		}

		try {
			// Get the inventory drop
			const drop = await db
				.select({
					id: inventoryDrops.id,
					status: inventoryDrops.status,
					itemCount: inventoryDrops.itemCount
				})
				.from(inventoryDrops)
				.where(eq(inventoryDrops.id, params.dropId))
				.limit(1);

			if (drop.length === 0) {
				return { success: false, error: 'Inventory drop not found' };
			}

			// Check if already processing
			if (drop[0].status === 'processing') {
				return {
					success: false,
					error: 'Drop is already being processed'
				};
			}

			// Update status to processing
			await db
				.update(inventoryDrops)
				.set({
					status: 'processing',
					processingError: null
				})
				.where(eq(inventoryDrops.id, params.dropId));

			// Note: The actual AI processing would be triggered by a background job
			// that monitors for 'processing' status drops. This tool just marks it
			// for processing.

			return {
				success: true,
				dropId: params.dropId,
				status: 'processing',
				itemCount: drop[0].itemCount || 0
			};
		} catch (error) {
			log.error({ error }, 'Process inventory photos tool error');
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: ProcessInventoryPhotosResult): string {
		if (result.success) {
			return `Inventory drop ${result.dropId?.slice(0, 8)}... queued for processing`;
		}
		return `Failed to process inventory: ${result.error}`;
	}
};
