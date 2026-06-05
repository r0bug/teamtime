<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { notify } from '$lib/notify';
	import { formatCurrency, formatDateTime } from '$lib/utils';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let processing = false;
	let retrying = false;
	let completingReview = false;
	let deletingItemId: string | null = null;

	// Confirmation dialog state
	let confirmingDeleteDrop = false;
	let confirmingDeleteItemId: string | null = null;
	let confirmingCompleteReview = false;

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

	function formatPrice(price: string | number | null) {
		return price ? formatCurrency(price) : '-';
	}

	function getConfidenceLabel(score: string | null) {
		if (!score) return { label: 'Unknown', color: 'text-gray-500' };
		const num = parseFloat(score);
		if (num >= 0.8) return { label: 'High', color: 'text-green-600' };
		if (num >= 0.5) return { label: 'Medium', color: 'text-yellow-600' };
		return { label: 'Low', color: 'text-red-600' };
	}

	async function processDrops() {
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
			notify.success(`Successfully identified ${result.itemCount} items!`);
			await invalidateAll();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to process drop');
		} finally {
			processing = false;
		}
	}

	async function retryDrop() {
		retrying = true;

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/retry`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to retry drop');
			}

			notify.success('Drop queued for retry. Processing will begin shortly.');
			startPolling();
			await invalidateAll();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to retry drop');
		} finally {
			retrying = false;
		}
	}

	async function deleteDrop() {
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
			notify.error(e instanceof Error ? e.message : 'Failed to delete drop');
		}
	}

	async function deleteItem(itemId: string) {
		deletingItemId = itemId;

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/items/${itemId}/delete`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete item');
			}

			notify.success('Item deleted successfully');
			await invalidateAll();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to delete item');
		} finally {
			deletingItemId = null;
		}
	}

	async function completeReview() {
		completingReview = true;

		try {
			const response = await fetch(`/api/inventory-drops/${data.drop.id}/complete`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to complete review');
			}

			notify.success('Drop marked as reviewed!');
			goto('/inventory/drops');
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to complete review');
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
	}

	async function createPricing() {
		if (!selectedItem) return;

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
			notify.success('Pricing decision created successfully!');
			await invalidateAll();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to create pricing decision');
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
			notify.error('Please enter an item description');
			return;
		}

		addingItem = true;

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
			notify.success('Item added successfully!');
			await invalidateAll();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to add item');
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
					<StatusBadge status={data.drop.status} />
					{#if data.drop.reviewedAt}
						<StatusBadge variant="primary" label="Reviewed" />
					{/if}
					{#if data.drop.userName}
						<span class="text-sm text-gray-500">By {data.drop.userName}</span>
					{/if}
					<span class="text-sm text-gray-500">{formatDateTime(data.drop.createdAt)}</span>
				</div>
			</div>
		</div>
	</div>

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
								<Spinner size="sm" />
								<span class="ml-2">Retrying...</span>
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
						on:click={() => confirmingDeleteDrop = true}
						class="btn-danger"
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
							<Spinner size="sm" />
							<span class="ml-2">Processing...</span>
						{:else}
							<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
							</svg>
							Process with AI
						{/if}
					</button>
					<button
						on:click={() => confirmingDeleteDrop = true}
						class="btn-danger"
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
												on:click={() => confirmingDeleteItemId = item.id}
												disabled={isDeleting}
												class="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors"
												title="Delete item"
											>
												{#if isDeleting}
													<span class="text-red-600"><Spinner size="sm" /></span>
												{:else}
													<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
													</svg>
												{/if}
											</button>
										{/if}
									</div>

									{#if item.deleted}
										<div class="mt-1">
											<StatusBadge variant="danger" label="Deleted" />
										</div>
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
												<StatusBadge
													variant={item.pricingDestination === 'ebay' ? 'primary' : 'success'}
													label={item.pricingDestination === 'ebay' ? 'eBay' : 'Store'}
												/>
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
								on:click={() => confirmingCompleteReview = true}
								disabled={completingReview}
								class="btn-primary"
							>
								{#if completingReview}
									<Spinner size="sm" />
									<span class="ml-2">Completing...</span>
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
				<div class="text-primary-600 flex justify-center mb-4"><Spinner size="lg" /></div>
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
<Modal open={showPricingModal} title="Create Pricing Decision" size="lg" on:close={closePricingModal}>
	{#if selectedItem}
		<p class="text-sm text-gray-600 mb-4">{selectedItem.itemDescription}</p>

		<form on:submit|preventDefault={createPricing} class="space-y-4">
			<div>
				<label for="price" class="label">Price *</label>
				<div class="relative">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
					<input
						id="price"
						type="number"
						step="0.01"
						min="0.01"
						bind:value={pricingForm.price}
						class="input pl-7"
						placeholder="0.00"
						required
					/>
				</div>
			</div>

			<div>
				<label for="justification" class="label">Price Justification *</label>
				<textarea
					id="justification"
					bind:value={pricingForm.priceJustification}
					rows="2"
					class="input"
					placeholder="Explain why you chose this price"
					required
				></textarea>
				<p class="text-xs text-gray-500 mt-1">Minimum 10 characters</p>
			</div>

			<div>
				<label class="label">Destination</label>
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
					<label for="ebayReason" class="label">Why eBay? *</label>
					<textarea
						id="ebayReason"
						bind:value={pricingForm.ebayReason}
						rows="2"
						class="input"
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
						<Spinner size="sm" />
						<span class="ml-2">Creating...</span>
					{:else}
						Create Pricing
					{/if}
				</button>
			</div>
		</form>
	{/if}
</Modal>

<!-- Add Item Modal -->
<Modal open={showAddItemModal} title="Add Item Manually" size="lg" on:close={closeAddItemModal}>
	<form on:submit|preventDefault={addItem} class="space-y-4">
		<div>
			<label for="itemDescription" class="label">Item Description *</label>
			<textarea
				id="itemDescription"
				bind:value={addItemForm.description}
				rows="2"
				class="input"
				placeholder="Describe the item (e.g., 'Vintage brass table lamp with green shade')"
				required
			></textarea>
		</div>

		<div>
			<label for="suggestedPrice" class="label">Suggested Price (optional)</label>
			<div class="relative">
				<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
				<input
					id="suggestedPrice"
					type="number"
					step="0.01"
					min="0"
					bind:value={addItemForm.suggestedPrice}
					class="input pl-7"
					placeholder="0.00"
				/>
			</div>
		</div>

		<!-- Photo Selection -->
		{#if data.drop.photos.length > 0}
			<div>
				<label class="label">
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
					<Spinner size="sm" />
					<span class="ml-2">Adding...</span>
				{:else}
					Add Item
				{/if}
			</button>
		</div>
	</form>
</Modal>

<ConfirmDialog
	open={confirmingDeleteDrop}
	title="Delete drop?"
	message="This will permanently delete the drop and cannot be undone."
	confirmLabel="Delete"
	on:confirm={() => { confirmingDeleteDrop = false; deleteDrop(); }}
	on:cancel={() => (confirmingDeleteDrop = false)}
/>

<ConfirmDialog
	open={confirmingDeleteItemId !== null}
	title="Delete item?"
	message="It will no longer be available for pricing."
	confirmLabel="Delete"
	on:confirm={() => { const id = confirmingDeleteItemId; confirmingDeleteItemId = null; if (id) deleteItem(id); }}
	on:cancel={() => (confirmingDeleteItemId = null)}
/>

<ConfirmDialog
	open={confirmingCompleteReview}
	title="Mark as reviewed?"
	message="This action cannot be undone."
	confirmLabel="Mark reviewed"
	variant="primary"
	on:confirm={() => { confirmingCompleteReview = false; completeReview(); }}
	on:cancel={() => (confirmingCompleteReview = false)}
/>
