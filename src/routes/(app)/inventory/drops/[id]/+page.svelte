<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let processing = false;
	let retrying = false;
	let error = '';
	let success = '';
	let completingReview = false;
	let deletingItemId: string | null = null;

	// Progress polling
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let progressPercent = 0;
	let progressStage: 'uploading' | 'processing' | 'completed' | 'failed' = 'uploading';

	// Modal state for creating pricing
	let showPricingModal = false;
	let selectedItem: typeof data.drop.items[0] | null = null;
	let pricingForm = {
		price: '',
		priceJustification: '',
		destination: 'store' as 'store' | 'ebay',
		ebayReason: ''
	};
	let creatingPricing = false;

	// Modal state for adding new item
	let showAddItemModal = false;
	let addItemForm = {
		description: '',
		suggestedPrice: '',
		sourcePhotoIds: [] as string[]
	};
	let addingItem = false;

	// Computed stats
	$: activeItems = data.drop.items.filter(i => !i.deleted);
	$: deletedItems = data.drop.items.filter(i => i.deleted);
	$: pricedItems = activeItems.filter(i => i.pricingDecisionId);
	$: canComplete = data.drop.status === 'completed' && !data.drop.reviewedAt;
	$: isProcessing = data.drop.status === 'pending' || data.drop.status === 'processing';
	$: canRetry = data.drop.status === 'failed' && (data.drop.retryCount ?? 0) < 3;

	// Start polling when processing
	onMount(() => {
		if (isProcessing) {
			startPolling();
		}
	});

	onDestroy(() => {
		stopPolling();
	});

	function startPolling() {
		if (pollInterval) return;
		pollProgress();
		pollInterval = setInterval(pollProgress, 2000);
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	async function pollProgress() {
		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/progress`);
			if (response.ok) {
				const { progress } = await response.json();
				progressPercent = progress.percent;
				progressStage = progress.stage;

				// Stop polling if complete or failed
				if (progress.isComplete || progress.isFailed) {
					stopPolling();
					await invalidateAll();
				}
			}
		} catch (e) {
			console.error('Error polling progress:', e);
		}
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatPrice(price: string | number | null) {
		if (!price) return '-';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(typeof price === 'string' ? parseFloat(price) : price);
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'pending': return 'bg-yellow-100 text-yellow-800';
			case 'processing': return 'bg-blue-100 text-blue-800';
			case 'completed': return 'bg-green-100 text-green-800';
			case 'failed': return 'bg-red-100 text-red-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function getStatusLabel(status: string) {
		switch (status) {
			case 'pending': return 'Pending';
			case 'processing': return 'Processing';
			case 'completed': return 'Completed';
			case 'failed': return 'Failed';
			default: return status;
		}
	}

	function getConfidenceLabel(score: string | null) {
		if (!score) return { label: 'Unknown', color: 'text-gray-500' };
		const num = parseFloat(score);
		if (num >= 0.8) return { label: 'High', color: 'text-green-600' };
		if (num >= 0.5) return { label: 'Medium', color: 'text-yellow-600' };
		return { label: 'Low', color: 'text-red-600' };
	}

	async function processDrops() {
		error = '';
		success = '';
		processing = true;

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/process`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to process drop');
			}

			const result = await response.json();
			success = `Successfully identified ${result.itemCount} items!`;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to process drop';
		} finally {
			processing = false;
		}
	}

	async function retryDrop() {
		error = '';
		success = '';
		retrying = true;

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/retry`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to retry drop');
			}

			success = 'Drop queued for retry. Processing will begin shortly.';
			startPolling();
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to retry drop';
		} finally {
			retrying = false;
		}
	}

	async function deleteDrop() {
		if (!confirm('Are you sure you want to delete this drop? This cannot be undone.')) {
			return;
		}

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete drop');
			}

			goto('/inventory/drops');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete drop';
		}
	}

	async function deleteItem(itemId: string) {
		if (!confirm('Are you sure you want to delete this item? It will no longer be available for pricing.')) {
			return;
		}

		deletingItemId = itemId;
		error = '';

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/items/${itemId}/delete`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete item');
			}

			success = 'Item deleted successfully';
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete item';
		} finally {
			deletingItemId = null;
		}
	}

	async function completeReview() {
		if (!confirm('Mark this drop as reviewed? This action cannot be undone.')) {
			return;
		}

		completingReview = true;
		error = '';

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/complete`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to complete review');
			}

			success = 'Drop marked as reviewed!';
			goto('/inventory/drops');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to complete review';
			completingReview = false;
		}
	}

	function openPricingModal(item: typeof data.drop.items[0]) {
		selectedItem = item;
		pricingForm = {
			price: item.suggestedPrice || '',
			priceJustification: '',
			destination: 'store',
			ebayReason: ''
		};
		showPricingModal = true;
	}

	function closePricingModal() {
		showPricingModal = false;
		selectedItem = null;
	}

	async function createPricing() {
		if (!selectedItem) return;

		error = '';
		creatingPricing = true;

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/items/${selectedItem.id}/create-pricing`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					price: pricingForm.price,
					priceJustification: pricingForm.priceJustification,
					destination: pricingForm.destination,
					ebayReason: pricingForm.destination === 'ebay' ? pricingForm.ebayReason : null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create pricing decision');
			}

			closePricingModal();
			success = 'Pricing decision created successfully!';
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create pricing decision';
		} finally {
			creatingPricing = false;
		}
	}

	// Get photos for an item
	function getItemPhotos(sourcePhotoIds: string[] | null) {
		if (!sourcePhotoIds || sourcePhotoIds.length === 0) return [];
		return data.drop.photos.filter(p => sourcePhotoIds.includes(p.id));
	}

	// Selected photo for lightbox
	let lightboxPhoto: string | null = null;

	// Add Item functions
	function openAddItemModal() {
		addItemForm = {
			description: '',
			suggestedPrice: '',
			sourcePhotoIds: []
		};
		showAddItemModal = true;
	}

	function closeAddItemModal() {
		showAddItemModal = false;
	}

	function togglePhotoSelection(photoId: string) {
		if (addItemForm.sourcePhotoIds.includes(photoId)) {
			addItemForm.sourcePhotoIds = addItemForm.sourcePhotoIds.filter(id => id !== photoId);
		} else {
			addItemForm.sourcePhotoIds = [...addItemForm.sourcePhotoIds, photoId];
		}
	}

	async function addItem() {
		if (!addItemForm.description.trim()) {
			error = 'Please enter an item description';
			return;
		}

		addingItem = true;
		error = '';

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					description: addItemForm.description.trim(),
					suggestedPrice: addItemForm.suggestedPrice ? parseFloat(addItemForm.suggestedPrice) : null,
					sourcePhotoIds: addItemForm.sourcePhotoIds.length > 0 ? addItemForm.sourcePhotoIds : null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to add item');
			}

			closeAddItemModal();
			success = 'Item added successfully!';
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add item';
		} finally {
			addingItem = false;
		}
	}
</script>

<svelte:head>
	<title>Inventory Drop - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="mb-6">
		<a href="/inventory/drops" class="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm mb-2">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to Inventory Drops
		</a>
		<div class="flex items-start justify-between">
			<div>
				<h1 class="text-2xl font-bold">{data.drop.description}</h1>
				<div class="flex items-center gap-3 mt-2">
					<span class="px-2 py-0.5 text-xs font-medium rounded-full {getStatusColor(data.drop.status)}">
						{getStatusLabel(data.drop.status)}
					</span>
					{#if data.drop.reviewedAt}
						<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
							Reviewed
						</span>
					{/if}
					{#if data.drop.userName}
						<span class="text-sm text-gray-500">By {data.drop.userName}</span>
					{/if}
					<span class="text-sm text-gray-500">{formatDate(data.drop.createdAt)}</span>
				</div>
			</div>
		</div>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
			{error}
		</div>
	{/if}

	{#if success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
			{success}
		</div>
	{/if}

	<!-- Pick Notes -->
	{#if data.drop.pickNotes}
		<div class="card mb-6">
			<div class="card-body">
				<h2 class="text-sm font-medium text-gray-700 mb-1">Pick Notes</h2>
				<p class="text-gray-600">{data.drop.pickNotes}</p>
			</div>
		</div>
	{/if}

	<!-- Photos -->
	<div class="card mb-6">
		<div class="card-body">
			<h2 class="text-lg font-semibold mb-4">Photos ({data.drop.photos.length})</h2>
			<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
				{#each data.drop.photos as photo, index}
					<button
						type="button"
						on:click={() => lightboxPhoto = photo.filePath}
						class="aspect-square bg-gray-100 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
					>
						<img src={photo.filePath} alt="Photo {index + 1}" class="w-full h-full object-cover" />
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Processing Progress -->
	{#if isProcessing}
		<div class="card mb-6">
			<div class="card-body">
				<div class="flex items-center justify-between mb-2">
					<h3 class="font-semibold text-gray-900">Processing in progress...</h3>
					<span class="text-sm text-gray-500">{progressPercent}%</span>
				</div>
				<div class="w-full bg-gray-200 rounded-full h-3 mb-3">
					<div
						class="bg-primary-600 h-3 rounded-full transition-all duration-500"
						style="width: {progressPercent}%"
					></div>
				</div>
				<p class="text-sm text-gray-600">
					{#if progressStage === 'uploading'}
						Uploading photos ({data.drop.photosUploaded ?? 0}/{data.drop.photosTotal ?? 0})...
					{:else if progressStage === 'processing'}
						AI is analyzing your photos and identifying items...
					{:else}
						Preparing...
					{/if}
				</p>
				<p class="text-xs text-gray-500 mt-2">
					This page will update automatically when processing completes.
				</p>
			</div>
		</div>
	{/if}

	<!-- Failed State with Retry -->
	{#if data.drop.status === 'failed'}
		<div class="card mb-6 border-red-200 bg-red-50">
			<div class="card-body">
				<div class="flex items-start gap-3">
					<div class="flex-shrink-0">
						<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<div class="flex-1">
						<h3 class="font-semibold text-red-800">Processing Failed</h3>
						{#if data.drop.processingError}
							<p class="text-sm text-red-600 mt-1">{data.drop.processingError}</p>
						{/if}
						{#if data.drop.uploadError}
							<p class="text-sm text-red-600 mt-1">Upload error: {data.drop.uploadError}</p>
						{/if}
						<p class="text-xs text-red-500 mt-2">
							Retry attempts: {data.drop.retryCount ?? 0}/3
						</p>
					</div>
				</div>
				<div class="flex flex-wrap gap-3 mt-4">
					{#if canRetry}
						<button
							on:click={retryDrop}
							disabled={retrying}
							class="btn-primary"
						>
							{#if retrying}
								<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
								Retrying...
							{:else}
								<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
								</svg>
								Retry Processing
							{/if}
						</button>
					{:else}
						<p class="text-sm text-red-600">Maximum retry attempts reached. Please contact support.</p>
					{/if}
					<button
						on:click={deleteDrop}
						class="btn-secondary text-red-600 hover:bg-red-100"
					>
						<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						Delete Drop
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Actions (only show if not processing or failed) -->
	{#if data.drop.status === 'pending' && !isProcessing}
		<div class="card mb-6">
			<div class="card-body">
				<div class="flex flex-wrap gap-3">
					<button
						on:click={processDrops}
						disabled={processing}
						class="btn-primary"
					>
						{#if processing}
							<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
							Processing...
						{:else}
							<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
							</svg>
							Process with AI
						{/if}
					</button>
					<button
						on:click={deleteDrop}
						class="btn-secondary text-red-600 hover:bg-red-50"
					>
						<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						Delete Drop
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Identified Items -->
	{#if data.drop.status === 'completed' && data.drop.items.length > 0}
		<div class="card">
			<div class="card-body">
				<div class="flex items-center justify-between mb-4">
					<div>
						<h2 class="text-lg font-semibold">Identified Items</h2>
						<p class="text-sm text-gray-500">
							{activeItems.length} active{#if deletedItems.length > 0}, {deletedItems.length} deleted{/if}
							{#if pricedItems.length > 0}
								&bull; {pricedItems.length} priced
							{/if}
						</p>
					</div>
					{#if !data.drop.reviewedAt}
						<button
							on:click={openAddItemModal}
							class="btn-secondary text-sm"
						>
							<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
							Add Item
						</button>
					{/if}
				</div>
				<div class="space-y-4">
					{#each data.drop.items as item}
						{@const itemPhotos = getItemPhotos(item.sourcePhotoIds)}
						{@const confidence = getConfidenceLabel(item.confidenceScore)}
						{@const isDeleting = deletingItemId === item.id}
						<div class="border rounded-lg p-4 {item.deleted ? 'opacity-50 bg-gray-50' : ''}">
							<div class="flex gap-4">
								<!-- Item photos -->
								{#if itemPhotos.length > 0}
									<div class="flex-shrink-0 flex gap-1">
										{#each itemPhotos.slice(0, 2) as photo}
											<button
												type="button"
												on:click={() => lightboxPhoto = photo.filePath}
												class="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden hover:opacity-80"
											>
												<img src={photo.filePath} alt="Item" class="w-full h-full object-cover {item.deleted ? 'grayscale' : ''}" />
											</button>
										{/each}
										{#if itemPhotos.length > 2}
											<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-sm text-gray-600">
												+{itemPhotos.length - 2}
											</div>
										{/if}
									</div>
								{/if}

								<!-- Item details -->
								<div class="flex-1 min-w-0">
									<div class="flex items-start justify-between gap-2">
										<p class="font-medium text-gray-900 {item.deleted ? 'line-through' : ''}">{item.itemDescription}</p>
										<!-- Delete button - only show if not already deleted and no pricing decision -->
										{#if !item.deleted && !item.pricingDecisionId && !data.drop.reviewedAt}
											<button
												on:click={() => deleteItem(item.id)}
												disabled={isDeleting}
												class="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors"
												title="Delete item"
											>
												{#if isDeleting}
													<div class="w-5 h-5 animate-spin rounded-full border-2 border-gray-300 border-t-red-600"></div>
												{:else}
													<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
													</svg>
												{/if}
											</button>
										{/if}
									</div>

									{#if item.deleted}
										<span class="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
											Deleted
										</span>
									{:else}
										<div class="flex flex-wrap items-center gap-3 mt-2 text-sm">
											{#if item.suggestedPrice}
												<span class="text-primary-600 font-medium">
													Suggested: {formatPrice(item.suggestedPrice)}
												</span>
											{/if}
											<span class={confidence.color}>
												Confidence: {confidence.label}
											</span>
										</div>

										<!-- Pricing decision info -->
										{#if item.pricingDecisionId}
											<div class="mt-2 flex items-center gap-2">
												<span class="px-2 py-0.5 text-xs font-medium rounded-full {item.pricingDestination === 'ebay' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
													{item.pricingDestination === 'ebay' ? 'eBay' : 'Store'}
												</span>
												<span class="font-medium text-gray-900">{formatPrice(item.pricingPrice)}</span>
												<a href="/pricing/{item.pricingDecisionId}" class="text-primary-600 hover:underline text-sm">
													View Decision
												</a>
											</div>
										{:else if !data.drop.reviewedAt}
											<button
												on:click={() => openPricingModal(item)}
												class="mt-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
											>
												Create Pricing Decision
											</button>
										{/if}
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Done Reviewing Button -->
				{#if canComplete}
					<div class="mt-6 pt-6 border-t border-gray-200">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="font-medium text-gray-900">Done reviewing?</h3>
								<p class="text-sm text-gray-500">
									Mark this drop as complete once you've priced all relevant items.
								</p>
							</div>
							<button
								on:click={completeReview}
								disabled={completingReview}
								class="btn-primary"
							>
								{#if completingReview}
									<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
									Completing...
								{:else}
									<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
									Done Reviewing
								{/if}
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{:else if data.drop.status === 'completed'}
		<div class="card">
			<div class="card-body text-center py-8">
				<p class="text-gray-600 mb-4">No items were identified in this drop.</p>
				{#if !data.drop.reviewedAt}
					<button
						on:click={openAddItemModal}
						class="btn-primary"
					>
						<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
						Add Item Manually
					</button>
				{/if}
			</div>
		</div>
	{:else if data.drop.status === 'processing'}
		<div class="card">
			<div class="card-body text-center py-8">
				<div class="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent mx-auto mb-4"></div>
				<p class="text-gray-600">Processing photos with AI...</p>
				<p class="text-sm text-gray-500 mt-1">This may take a few moments.</p>
			</div>
		</div>
	{/if}
</div>

<!-- Lightbox -->
{#if lightboxPhoto}
	<div
		class="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
		on:click={() => lightboxPhoto = null}
	>
		<button
			class="absolute top-4 right-4 text-white p-2"
			on:click={() => lightboxPhoto = null}
		>
			<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
		<img
			src={lightboxPhoto}
			alt="Full size"
			class="max-w-full max-h-full object-contain"
			on:click|stopPropagation
		/>
	</div>
{/if}

<!-- Pricing Modal -->
{#if showPricingModal && selectedItem}
	<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
		<div class="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
			<div class="p-6">
				<div class="flex items-start justify-between mb-4">
					<h2 class="text-lg font-semibold">Create Pricing Decision</h2>
					<button on:click={closePricingModal} class="text-gray-400 hover:text-gray-600">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<p class="text-sm text-gray-600 mb-4">{selectedItem.itemDescription}</p>

				<form on:submit|preventDefault={createPricing} class="space-y-4">
					<div>
						<label for="price" class="block text-sm font-medium text-gray-700 mb-1">Price *</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
							<input
								id="price"
								type="number"
								step="0.01"
								min="0.01"
								bind:value={pricingForm.price}
								class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
								placeholder="0.00"
								required
							/>
						</div>
					</div>

					<div>
						<label for="justification" class="block text-sm font-medium text-gray-700 mb-1">Price Justification *</label>
						<textarea
							id="justification"
							bind:value={pricingForm.priceJustification}
							rows="2"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							placeholder="Explain why you chose this price"
							required
						></textarea>
						<p class="text-xs text-gray-500 mt-1">Minimum 10 characters</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">Destination</label>
						<div class="flex gap-4">
							<label class="flex-1 cursor-pointer">
								<input type="radio" bind:group={pricingForm.destination} value="store" class="sr-only peer" />
								<div class="p-3 border-2 rounded-lg peer-checked:border-primary-500 peer-checked:bg-primary-50 hover:bg-gray-50 text-center">
									<div class="font-medium">Store</div>
								</div>
							</label>
							<label class="flex-1 cursor-pointer">
								<input type="radio" bind:group={pricingForm.destination} value="ebay" class="sr-only peer" />
								<div class="p-3 border-2 rounded-lg peer-checked:border-primary-500 peer-checked:bg-primary-50 hover:bg-gray-50 text-center">
									<div class="font-medium">eBay</div>
								</div>
							</label>
						</div>
					</div>

					{#if pricingForm.destination === 'ebay'}
						<div>
							<label for="ebayReason" class="block text-sm font-medium text-gray-700 mb-1">Why eBay? *</label>
							<textarea
								id="ebayReason"
								bind:value={pricingForm.ebayReason}
								rows="2"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
								placeholder="Explain why this should be listed on eBay"
								required
							></textarea>
						</div>
					{/if}

					<div class="flex gap-3 pt-2">
						<button type="button" on:click={closePricingModal} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={creatingPricing} class="btn-primary flex-1">
							{#if creatingPricing}
								<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
								Creating...
							{:else}
								Create Pricing
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Add Item Modal -->
{#if showAddItemModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
		<div class="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
			<div class="p-6">
				<div class="flex items-start justify-between mb-4">
					<h2 class="text-lg font-semibold">Add Item Manually</h2>
					<button on:click={closeAddItemModal} class="text-gray-400 hover:text-gray-600">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<form on:submit|preventDefault={addItem} class="space-y-4">
					<div>
						<label for="itemDescription" class="block text-sm font-medium text-gray-700 mb-1">Item Description *</label>
						<textarea
							id="itemDescription"
							bind:value={addItemForm.description}
							rows="2"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							placeholder="Describe the item (e.g., 'Vintage brass table lamp with green shade')"
							required
						></textarea>
					</div>

					<div>
						<label for="suggestedPrice" class="block text-sm font-medium text-gray-700 mb-1">Suggested Price (optional)</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
							<input
								id="suggestedPrice"
								type="number"
								step="0.01"
								min="0"
								bind:value={addItemForm.suggestedPrice}
								class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
								placeholder="0.00"
							/>
						</div>
					</div>

					<!-- Photo Selection -->
					{#if data.drop.photos.length > 0}
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">
								Select Photos (optional)
								{#if addItemForm.sourcePhotoIds.length > 0}
									<span class="font-normal text-gray-500">({addItemForm.sourcePhotoIds.length} selected)</span>
								{/if}
							</label>
							<div class="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
								{#each data.drop.photos as photo}
									<button
										type="button"
										on:click={() => togglePhotoSelection(photo.id)}
										class="aspect-square bg-gray-100 rounded-lg overflow-hidden relative {addItemForm.sourcePhotoIds.includes(photo.id) ? 'ring-2 ring-primary-500' : 'hover:opacity-80'}"
									>
										<img src={photo.filePath} alt="Photo" class="w-full h-full object-cover" />
										{#if addItemForm.sourcePhotoIds.includes(photo.id)}
											<div class="absolute inset-0 bg-primary-500 bg-opacity-30 flex items-center justify-center">
												<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
												</svg>
											</div>
										{/if}
									</button>
								{/each}
							</div>
							<p class="text-xs text-gray-500 mt-1">Click photos to select which ones show this item</p>
						</div>
					{/if}

					<div class="flex gap-3 pt-2">
						<button type="button" on:click={closeAddItemModal} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={addingItem} class="btn-primary flex-1">
							{#if addingItem}
								<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
								Adding...
							{:else}
								Add Item
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
