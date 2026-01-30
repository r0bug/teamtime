// Inventory Drop Processor Job - handles AI processing of drop photos
import { db, inventoryDrops, inventoryDropPhotos, inventoryDropItems } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { registerHandler } from './processor';
import type { JobPayload, JobResult } from './queue';
import { updateProcessingStatus, createFinalizeTask } from '$lib/server/services/inventory-drops';
import { getAPIKey } from '$lib/ai/config/keys';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import path from 'path';
import { createLogger } from '$lib/server/logger';

const log = createLogger('server:inventory-drop-processor');

interface IdentifiedItem {
	description: string;
	suggestedPrice?: number;
	confidence: number;
	photoIndices: number[];
}

// Process inventory drop photos with AI
async function processInventoryDrop(
	payload: JobPayload['inventory_drop_process']
): Promise<JobResult['inventory_drop_process']> {
	const { dropId, userId } = payload;

	log.info({ dropId, userId }, 'Starting processing for drop');

	// Update status to processing
	await updateProcessingStatus(dropId, 'processing');

	// Get the drop
	const [drop] = await db
		.select()
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		throw new Error('Drop not found');
	}

	// Get photos
	const photos = await db
		.select()
		.from(inventoryDropPhotos)
		.where(eq(inventoryDropPhotos.dropId, dropId))
		.orderBy(inventoryDropPhotos.orderIndex);

	if (photos.length === 0) {
		throw new Error('No photos found for this drop');
	}

	// Build the image content for Claude
	const imageContents: Anthropic.ImageBlockParam[] = [];

	for (const photo of photos) {
		try {
			// Read the image file and convert to base64
			const imagePath = path.join(process.cwd(), 'uploads', photo.filePath.replace('/uploads/', ''));
			const imageBuffer = await readFile(imagePath);
			const base64 = imageBuffer.toString('base64');

			// Determine media type
			let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
			if (photo.mimeType === 'image/png') mediaType = 'image/png';
			else if (photo.mimeType === 'image/gif') mediaType = 'image/gif';
			else if (photo.mimeType === 'image/webp') mediaType = 'image/webp';

			imageContents.push({
				type: 'image',
				source: {
					type: 'base64',
					media_type: mediaType,
					data: base64
				}
			});
		} catch (error) {
			log.error({
				filePath: photo.filePath,
				error: error instanceof Error ? error.message : String(error)
			}, 'Failed to read image');
		}
	}

	if (imageContents.length === 0) {
		throw new Error('No images could be loaded for processing');
	}

	// Call Claude to identify items
	const apiKey = getAPIKey('anthropic');
	if (!apiKey) {
		throw new Error('Anthropic API key not configured. Please add it in Admin > AI Mentats.');
	}

	const anthropic = new Anthropic({ apiKey });

	const systemPrompt = `You are an inventory identification assistant for an estate sale business. Your job is to analyze photos of items and identify distinct sellable items.

For each distinct item you can identify in the photos, provide:
1. A clear description suitable for pricing (include brand, model, condition details if visible)
2. Your confidence level (0.0 to 1.0) in the identification
3. Which photo(s) show this item (0-indexed)
4. An optional suggested price range if you can estimate value

Important guidelines:
- Each distinct item should be listed separately
- If the same item appears in multiple photos, list it once and note all the photo indices
- Focus on sellable items - ignore background clutter, trash, or non-sellable items
- Be specific in descriptions: "Vintage 1950s Pyrex mixing bowl, green, good condition" is better than "bowl"
- If an item is partially visible or unclear, note lower confidence
- For collections or sets, decide if they should be priced together or separately

Respond with valid JSON only in this exact format:
{
  "items": [
    {
      "description": "Item description here",
      "suggestedPrice": 25.00,
      "confidence": 0.85,
      "photoIndices": [0, 2]
    }
  ],
  "notes": "Any general observations about the batch"
}`;

	log.info({ dropId, imageCount: imageContents.length }, 'Calling Claude API for drop');

	const response = await anthropic.messages.create({
		model: 'claude-sonnet-4-20250514',
		max_tokens: 4096,
		system: systemPrompt,
		messages: [
			{
				role: 'user',
				content: [
					...imageContents,
					{
						type: 'text',
						text: `Please analyze these ${photos.length} photos and identify all distinct sellable items. The batch description provided by the user is: "${drop.description}"${drop.pickNotes ? ` Additional notes: "${drop.pickNotes}"` : ''}`
					}
				]
			}
		]
	});

	// Parse the response
	const textContent = response.content.find(c => c.type === 'text');
	if (!textContent || textContent.type !== 'text') {
		throw new Error('No text response from Claude');
	}

	// Extract JSON from the response
	let jsonText = textContent.text;
	const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		jsonText = jsonMatch[0];
	}

	const result = JSON.parse(jsonText);
	const items: IdentifiedItem[] = result.items || [];

	// Clear any existing items from previous processing attempts
	await db.delete(inventoryDropItems).where(eq(inventoryDropItems.dropId, dropId));

	// Insert identified items
	for (const item of items) {
		// Map photo indices to photo IDs
		const sourcePhotoIds = item.photoIndices
			.filter((idx: number) => idx >= 0 && idx < photos.length)
			.map((idx: number) => photos[idx].id);

		await db.insert(inventoryDropItems).values({
			dropId: dropId,
			itemDescription: item.description,
			suggestedPrice: item.suggestedPrice?.toString() || null,
			confidenceScore: item.confidence?.toString() || '0.50',
			sourcePhotoIds: sourcePhotoIds
		});
	}

	// Update drop status
	await updateProcessingStatus(dropId, 'completed', {
		itemCount: items.length
	});

	// Create finalize task
	try {
		await createFinalizeTask(dropId, userId);
	} catch (error) {
		log.error({
			dropId,
			error: error instanceof Error ? error.message : String(error)
		}, 'Failed to create finalize task for drop');
		// Don't fail the job for this - the processing was successful
	}

	log.info({ dropId, itemCount: items.length }, 'Completed processing drop');

	return {
		itemCount: items.length,
		notes: result.notes
	};
}

// Register the handler
registerHandler('inventory_drop_process', processInventoryDrop);

// Export for explicit registration
export { processInventoryDrop };
