<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: decision = data.decision;

	let selectedPhotoIndex = 0;
	let showLightbox = false;

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatPrice(price: string | number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(typeof price === 'string' ? parseFloat(price) : price);
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'completed': return 'bg-green-100 text-green-800';
			case 'in_progress': return 'bg-blue-100 text-blue-800';
			case 'cancelled': return 'bg-gray-100 text-gray-800';
			default: return 'bg-yellow-100 text-yellow-800';
		}
	}

	function getGradeColor(grade: number) {
		if (grade >= 4.5) return 'text-green-600';
		if (grade >= 3.5) return 'text-blue-600';
		if (grade >= 2.5) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getGradeLabel(grade: number) {
		if (grade >= 4.5) return 'Excellent';
		if (grade >= 3.5) return 'Good';
		if (grade >= 2.5) return 'Acceptable';
		return 'Needs Improvement';
	}

	function getPointsColor(points: number) {
		if (points > 0) return 'text-green-600';
		if (points < 0) return 'text-red-600';
		return 'text-gray-600';
	}

	function renderStars(rating: number) {
		return '★'.repeat(rating) + '☆'.repeat(5 - rating);
	}

	function openLightbox(index: number) {
		selectedPhotoIndex = index;
		showLightbox = true;
	}

	function closeLightbox() {
		showLightbox = false;
	}

	function nextPhoto() {
		selectedPhotoIndex = (selectedPhotoIndex + 1) % decision.photos.length;
	}

	function prevPhoto() {
		selectedPhotoIndex = (selectedPhotoIndex - 1 + decision.photos.length) % decision.photos.length;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!showLightbox) return;
		if (e.key === 'Escape') closeLightbox();
		if (e.key === 'ArrowRight') nextPhoto();
		if (e.key === 'ArrowLeft') prevPhoto();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<svelte:head>
	<title>{decision.itemDescription} - Pricing Details</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<div class="mb-6">
		<a href="/pricing" class="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm mb-2">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to Pricing History
		</a>
	</div>

	<!-- Photos Gallery -->
	{#if decision.photos.length > 0}
		<div class="card mb-6">
			<div class="card-body">
				<!-- Main Photo -->
				<button
					on:click={() => openLightbox(selectedPhotoIndex)}
					class="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden mb-3 cursor-zoom-in"
				>
					<img
						src="{decision.photos[selectedPhotoIndex].filePath}?w=800"
						alt={decision.itemDescription}
						class="w-full h-full object-contain"
					/>
				</button>

				<!-- Thumbnails -->
				{#if decision.photos.length > 1}
					<div class="flex gap-2 overflow-x-auto pb-2">
						{#each decision.photos as photo, index}
							<button
								on:click={() => selectedPhotoIndex = index}
								class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors {selectedPhotoIndex === index ? 'border-primary-500' : 'border-transparent hover:border-gray-300'}"
							>
								<img
									src="{photo.filePath}?w=128"
									alt="Thumbnail {index + 1}"
									class="w-full h-full object-cover"
									loading="lazy"
								/>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Item Details -->
	<div class="card mb-6">
		<div class="card-body">
			<div class="flex items-start justify-between mb-4">
				<div>
					<span class="px-2 py-0.5 text-xs font-medium rounded-full {decision.destination === 'ebay' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
						{decision.destination === 'ebay' ? 'eBay' : 'Store'}
					</span>
				</div>
				<span class="text-2xl font-bold text-primary-600">{formatPrice(decision.price)}</span>
			</div>

			<h1 class="text-xl font-bold text-gray-900 mb-4">{decision.itemDescription}</h1>

			<div class="border-t pt-4 space-y-4">
				<div>
					<h3 class="text-sm font-medium text-gray-500 mb-1">Price Justification</h3>
					<p class="text-gray-900">{decision.priceJustification}</p>
				</div>

				{#if decision.destination === 'ebay' && decision.ebayReason}
					<div>
						<h3 class="text-sm font-medium text-gray-500 mb-1">Why eBay?</h3>
						<p class="text-gray-900">{decision.ebayReason}</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- eBay Task Status -->
	{#if decision.ebayTask}
		<div class="card mb-6">
			<div class="card-body">
				<h2 class="text-lg font-semibold mb-3">eBay Listing Task</h2>

				<a
					href="/tasks/{decision.ebayTask.id}"
					class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
				>
					<div>
						<div class="flex items-center gap-2 mb-1">
							<span class="px-2 py-0.5 text-xs font-medium rounded-full {getStatusColor(decision.ebayTask.status)}">
								{decision.ebayTask.status.replace('_', ' ')}
							</span>
						</div>
						<p class="font-medium text-gray-900">{decision.ebayTask.title}</p>
						{#if decision.ebayTask.assigneeName}
							<p class="text-sm text-gray-500">Assigned to {decision.ebayTask.assigneeName}</p>
						{:else}
							<p class="text-sm text-gray-500">Unassigned - waiting for eBay team member to claim</p>
						{/if}
					</div>
					<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</a>
			</div>
		</div>
	{/if}

	<!-- Grading Results -->
	{#if decision.grade}
		<div class="card mb-6">
			<div class="card-body">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold">Grading Results</h2>
					<div class="flex items-center gap-2">
						<span class="text-2xl font-bold {getGradeColor(parseFloat(decision.grade.overallGrade))}">
							{decision.grade.overallGrade}
						</span>
						<span class="text-sm text-gray-500">/ 5.0</span>
					</div>
				</div>

				<!-- Overall Grade Badge -->
				<div class="flex items-center justify-between p-3 rounded-lg mb-4 {
					parseFloat(decision.grade.overallGrade) >= 4.5 ? 'bg-green-50 border border-green-200' :
					parseFloat(decision.grade.overallGrade) >= 3.5 ? 'bg-blue-50 border border-blue-200' :
					parseFloat(decision.grade.overallGrade) >= 2.5 ? 'bg-yellow-50 border border-yellow-200' :
					'bg-red-50 border border-red-200'
				}">
					<span class="font-medium {getGradeColor(parseFloat(decision.grade.overallGrade))}">
						{getGradeLabel(parseFloat(decision.grade.overallGrade))}
					</span>
					<span class="font-bold {getPointsColor(decision.grade.pointsAwarded)}">
						{decision.grade.pointsAwarded > 0 ? '+' : ''}{decision.grade.pointsAwarded} points
					</span>
				</div>

				<!-- Individual Scores -->
				<div class="space-y-3 mb-4">
					<div class="flex items-center justify-between">
						<span class="text-sm text-gray-600">Price Accuracy</span>
						<span class="text-amber-500 tracking-wider">{renderStars(decision.grade.priceAccuracy)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm text-gray-600">Justification Quality</span>
						<span class="text-amber-500 tracking-wider">{renderStars(decision.grade.justificationQuality)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm text-gray-600">Photo Quality</span>
						<span class="text-amber-500 tracking-wider">{renderStars(decision.grade.photoQuality)}</span>
					</div>
				</div>

				<!-- Feedback -->
				{#if decision.grade.feedback}
					<div class="border-t pt-4">
						<h3 class="text-sm font-medium text-gray-500 mb-2">Manager Feedback</h3>
						<p class="text-gray-900 bg-gray-50 p-3 rounded-lg">{decision.grade.feedback}</p>
					</div>
				{/if}

				<!-- Graded By -->
				<div class="text-xs text-gray-400 mt-4">
					Graded by {decision.grade.graderName || 'Manager'} on {formatDate(decision.grade.gradedAt)}
				</div>
			</div>
		</div>
	{:else}
		<!-- Pending Grade Notice -->
		<div class="card mb-6 bg-gray-50">
			<div class="card-body text-center py-6">
				<svg class="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
				</svg>
				<p class="text-gray-600 font-medium">Awaiting Review</p>
				<p class="text-sm text-gray-500">This pricing decision hasn't been graded yet</p>
			</div>
		</div>
	{/if}

	<!-- Metadata -->
	<div class="card">
		<div class="card-body">
			<h2 class="text-lg font-semibold mb-4">Details</h2>

			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<dt class="text-sm font-medium text-gray-500">Priced By</dt>
					<dd class="text-gray-900">{decision.userName || 'Unknown'}</dd>
				</div>

				<div>
					<dt class="text-sm font-medium text-gray-500">Priced At</dt>
					<dd class="text-gray-900">{formatDate(decision.pricedAt)}</dd>
				</div>

				{#if decision.locationName}
					<div>
						<dt class="text-sm font-medium text-gray-500">Location</dt>
						<dd class="text-gray-900">{decision.locationName}</dd>
					</div>
				{/if}

				{#if decision.lat && decision.lng}
					<div>
						<dt class="text-sm font-medium text-gray-500">GPS Coordinates</dt>
						<dd class="text-gray-900">
							<a
								href="https://www.google.com/maps?q={decision.lat},{decision.lng}"
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary-600 hover:text-primary-700"
							>
								{parseFloat(decision.lat).toFixed(6)}, {parseFloat(decision.lng).toFixed(6)}
							</a>
						</dd>
					</div>
				{/if}

				{#if decision.address}
					<div class="sm:col-span-2">
						<dt class="text-sm font-medium text-gray-500">Address</dt>
						<dd class="text-gray-900">{decision.address}</dd>
					</div>
				{/if}
			</dl>
		</div>
	</div>
</div>

<!-- Lightbox -->
{#if showLightbox}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
		on:click={closeLightbox}
	>
		<button
			on:click|stopPropagation={closeLightbox}
			class="absolute top-4 right-4 text-white p-2 hover:bg-white hover:bg-opacity-20 rounded-full"
		>
			<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>

		{#if decision.photos.length > 1}
			<button
				on:click|stopPropagation={prevPhoto}
				class="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white hover:bg-opacity-20 rounded-full"
			>
				<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</button>

			<button
				on:click|stopPropagation={nextPhoto}
				class="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white hover:bg-opacity-20 rounded-full"
			>
				<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		{/if}

		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
		<img
			src={decision.photos[selectedPhotoIndex].filePath}
			alt={decision.itemDescription}
			class="max-h-[90vh] max-w-[90vw] object-contain"
			on:click|stopPropagation
		/>

		<div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
			{selectedPhotoIndex + 1} / {decision.photos.length}
		</div>
	</div>
{/if}
