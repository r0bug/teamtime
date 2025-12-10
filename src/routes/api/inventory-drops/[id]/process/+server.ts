import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, inventoryDrops, inventoryDropPhotos, inventoryDropItems, pricingDecisions, pricingDecisionPhotos } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isManager } from '$lib/server/auth/roles';
import Anthropic from '@anthropic-ai/sdk';
import { getAPIKey } from '$lib/ai/config/keys';
import { readFile } from 'fs/promises';
import path from 'path';

interface IdentifiedItem {
	description: string;
	suggestedPrice?: number;
	confidence: number;
	photoIndices: number[];
}

// POST /api/inventory-drops/[id]/process - Trigger LLM processing
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const dropId = params.id;

	// Get the drop
	const [drop] = await db
		.select()
		.from(inventoryDrops)
		.where(eq(inventoryDrops.id, dropId))
		.limit(1);

	if (!drop) {
		return json({ error: 'Drop not found' }, { status: 404 });
	}

	// Check permissions - owner or manager can process
	if (!isManager(locals.user) && drop.userId !== locals.user.id) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	// Only pending or failed drops can be processed
	if (!['pending', 'failed'].includes(drop.status)) {
		return json({ error: 'Drop is already being processed or completed' }, { status: 400 });
	}

	// Get photos
	const photos = await db
		.select()
		.from(inventoryDropPhotos)
		.where(eq(inventoryDropPhotos.dropId, dropId))
		.orderBy(inventoryDropPhotos.orderIndex);

	if (photos.length === 0) {
		return json({ error: 'No photos found for this drop' }, { status: 400 });
	}

	// Update status to processing
	await db
		.update(inventoryDrops)
		.set({ status: 'processing', processingError: null })
		.where(eq(inventoryDrops.id, dropId));

	try {
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
				console.error(`Failed to read image ${photo.filePath}:`, error);
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
		await db
			.update(inventoryDrops)
			.set({
				status: 'completed',
				itemCount: items.length,
				processedAt: new Date()
			})
			.where(eq(inventoryDrops.id, dropId));

		return json({
			success: true,
			itemCount: items.length,
			notes: result.notes
		});
	} catch (error) {
		console.error('Error processing inventory drop:', error);

		// Update status to failed
		await db
			.update(inventoryDrops)
			.set({
				status: 'failed',
				processingError: error instanceof Error ? error.message : 'Unknown error'
			})
			.where(eq(inventoryDrops.id, dropId));

		return json({ error: 'Failed to process inventory drop' }, { status: 500 });
	}
};
