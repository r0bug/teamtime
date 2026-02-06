<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	$: ungradedPricing = data.ungradedPricing;
	$: stats = data.stats;
	$: showAll = data.showAll;

	// Bulk grading state
	let selectedIds = new Set<string>();
	let bulkPriceAccuracy = 3;
	let bulkJustificationQuality = 3;
	let bulkPhotoQuality = 3;
	let bulkFeedback = '';
	let bulkSubmitting = false;
	let bulkError = '';
	let bulkSuccess = '';

	$: selectableItems = ungradedPricing.filter((d) => !d.hasGrade);
	$: allSelected = selectableItems.length > 0 && selectableItems.every((d) => selectedIds.has(d.id));
	$: bulkOverallGrade = (bulkPriceAccuracy * 0.4 + bulkJustificationQuality * 0.3 + bulkPhotoQuality * 0.3).toFixed(2);
	$: bulkPointsPreview = getPointsPreview(parseFloat(bulkOverallGrade));

	function toggleSelect(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (allSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(selectableItems.map((d) => d.id));
		}
	}

	function clearSelection() {
		selectedIds = new Set();
		bulkError = '';
		bulkSuccess = '';
	}

	function formatDate(date: Date | string | null): string {
		if (!date) return '';
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString('en-US', {
			timeZone: 'America/Los_Angeles',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatPrice(price: string | number): string {
		return Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	}

	function getDestinationBadge(destination: string): { class: string; label: string } {
		switch (destination) {
			case 'ebay':
				return { class: 'bg-blue-100 text-blue-800', label: 'eBay' };
			case 'store':
				return { class: 'bg-green-100 text-green-800', label: 'Store' };
			default:
				return { class: 'bg-gray-100 text-gray-800', label: destination };
		}
	}

	function getPointsPreview(grade: number): { points: number; label: string; class: string } {
		if (grade >= 4.5) return { points: 25, label: 'Excellent', class: 'text-green-600' };
		if (grade >= 3.5) return { points: 15, label: 'Good', class: 'text-blue-600' };
		if (grade >= 2.5) return { points: 5, label: 'Acceptable', class: 'text-yellow-600' };
		return { points: -10, label: 'Poor', class: 'text-red-600' };
	}

	function getGradeColor(grade: number): string {
		if (grade >= 4.5) return 'text-green-600';
		if (grade >= 3.5) return 'text-blue-600';
		if (grade >= 2.5) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getSliderGradient(): string {
		return 'linear-gradient(to right, #ef4444, #f97316, #eab308, #3b82f6, #22c55e)';
	}

	async function submitBulkGrade() {
		if (selectedIds.size === 0) return;
		bulkSubmitting = true;
		bulkError = '';
		bulkSuccess = '';

		try {
			const response = await fetch('/api/admin/pricing/bulk-grade', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					decisionIds: Array.from(selectedIds),
					priceAccuracy: bulkPriceAccuracy,
					justificationQuality: bulkJustificationQuality,
					photoQuality: bulkPhotoQuality,
					feedback: bulkFeedback.trim() || undefined
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.message || 'Failed to grade');
			}

			const result = await response.json();
			bulkSuccess = `Graded ${result.graded} item${result.graded !== 1 ? 's' : ''}${result.skipped ? `, skipped ${result.skipped} already graded` : ''}`;
			selectedIds = new Set();
			bulkFeedback = '';
			await invalidateAll();
		} catch (e) {
			bulkError = e instanceof Error ? e.message : 'Failed to grade';
		} finally {
			bulkSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Pricing Grading - Admin</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto {selectedIds.size > 0 ? 'pb-80' : ''}">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Pricing Grading</h1>
			<p class="text-gray-600">Review and grade pricing decisions</p>
		</div>
		<a href="/admin" class="btn-secondary">Back to Admin</a>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-3 gap-4 mb-6">
		<div class="card">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-amber-600">{stats.ungraded}</p>
				<p class="text-sm text-gray-600">Ungraded</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-green-600">{stats.graded}</p>
				<p class="text-sm text-gray-600">Graded</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-gray-600">{stats.total}</p>
				<p class="text-sm text-gray-600">Total</p>
			</div>
		</div>
	</div>

	{#if bulkSuccess}
		<div class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center justify-between">
			<span>{bulkSuccess}</span>
			<button on:click={() => bulkSuccess = ''} class="text-green-500 hover:text-green-700">&times;</button>
		</div>
	{/if}

	<!-- Toggle View -->
	<div class="mb-4 flex gap-2">
		<a
			href="/admin/pricing/grading"
			class="px-4 py-2 rounded-lg transition-colors {!showAll ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Ungraded Only
		</a>
		<a
			href="/admin/pricing/grading?all=true"
			class="px-4 py-2 rounded-lg transition-colors {showAll ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Show All
		</a>
	</div>

	<!-- Pricing Decisions List -->
	<div class="card">
		<div class="card-header flex items-center justify-between">
			<h2 class="font-semibold">{showAll ? 'All Pricing Decisions' : 'Ungraded Pricing Decisions'}</h2>
			{#if selectableItems.length > 0}
				<label class="flex items-center gap-2 text-sm cursor-pointer">
					<input
						type="checkbox"
						checked={allSelected}
						on:change={toggleSelectAll}
						class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
					/>
					Select All ({selectableItems.length})
				</label>
			{/if}
		</div>

		{#if ungradedPricing.length === 0}
			<div class="card-body text-center py-12">
				<p class="text-4xl mb-4">🎉</p>
				<p class="text-gray-600">All pricing decisions have been graded!</p>
			</div>
		{:else}
			<div class="divide-y divide-gray-100">
				{#each ungradedPricing as decision}
					<div class="flex items-start p-4 hover:bg-gray-50 transition-colors">
						<!-- Checkbox -->
						<div class="flex-shrink-0 pt-1 mr-3">
							{#if !decision.hasGrade}
								<input
									type="checkbox"
									checked={selectedIds.has(decision.id)}
									on:change={() => toggleSelect(decision.id)}
									class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
								/>
							{:else}
								<input
									type="checkbox"
									disabled
									class="w-4 h-4 rounded border-gray-200 text-gray-300 cursor-not-allowed"
								/>
							{/if}
						</div>

						<!-- Content (clickable link) -->
						<a
							href="/admin/pricing/grading/{decision.id}"
							class="flex-1 min-w-0"
						>
							<div class="flex items-start justify-between">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<span class="font-medium text-gray-900 truncate">
											{decision.itemDescription}
										</span>
										<span class="px-2 py-0.5 text-xs rounded-full font-medium {getDestinationBadge(decision.destination).class}">
											{getDestinationBadge(decision.destination).label}
										</span>
										{#if decision.hasGrade}
											<span class="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-800">
												Graded
											</span>
										{/if}
									</div>
									<p class="text-sm text-gray-600 truncate mb-2">
										{decision.priceJustification}
									</p>
									<div class="flex items-center gap-4 text-xs text-gray-500">
										<span>By {decision.userName}</span>
										<span>{formatDate(decision.pricedAt)}</span>
										{#if decision.photoCount > 0}
											<span class="flex items-center gap-1">
												<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
												</svg>
												{decision.photoCount} photos
											</span>
										{/if}
									</div>
								</div>
								<div class="text-right ml-4">
									<p class="text-lg font-bold text-gray-900">{formatPrice(decision.price)}</p>
									<p class="text-xs text-primary-600 mt-1">
										{decision.hasGrade ? 'View' : 'Grade'} →
									</p>
								</div>
							</div>
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Grade Scale Reference -->
	<div class="mt-6 card">
		<div class="card-header">
			<h3 class="font-semibold">Grading Reference</h3>
		</div>
		<div class="card-body">
			<div class="grid md:grid-cols-5 gap-4 text-center text-sm">
				<div class="p-2 rounded-lg bg-red-50 border border-red-200">
					<p class="font-bold text-red-700">1 - Poor</p>
					<p class="text-xs text-red-600">Price way off, no real justification</p>
				</div>
				<div class="p-2 rounded-lg bg-orange-50 border border-orange-200">
					<p class="font-bold text-orange-700">2 - Below Average</p>
					<p class="text-xs text-orange-600">Price questionable, weak justification</p>
				</div>
				<div class="p-2 rounded-lg bg-yellow-50 border border-yellow-200">
					<p class="font-bold text-yellow-700">3 - Acceptable</p>
					<p class="text-xs text-yellow-600">Price defensible, basic justification</p>
				</div>
				<div class="p-2 rounded-lg bg-blue-50 border border-blue-200">
					<p class="font-bold text-blue-700">4 - Good</p>
					<p class="text-xs text-blue-600">Price reasonable, adequate justification</p>
				</div>
				<div class="p-2 rounded-lg bg-green-50 border border-green-200">
					<p class="font-bold text-green-700">5 - Excellent</p>
					<p class="text-xs text-green-600">Price spot-on, thorough justification</p>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Floating Bulk Grade Action Bar -->
{#if selectedIds.size > 0}
	<div class="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-primary-500 shadow-lg z-40 p-4">
		<div class="max-w-6xl mx-auto">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-bold text-sm">
						{selectedIds.size}
					</span>
					<span class="font-medium text-gray-900">selected</span>
					<button on:click={clearSelection} class="text-sm text-gray-500 hover:text-gray-700 underline">
						Clear
					</button>
				</div>
				<div class="text-center">
					<span class="text-2xl font-bold {getGradeColor(parseFloat(bulkOverallGrade))}">{bulkOverallGrade}</span>
					<span class="text-sm text-gray-500 ml-1">/ 5.0</span>
					<span class="ml-3 text-sm font-medium {bulkPointsPreview.class}">
						{bulkPointsPreview.label}: {bulkPointsPreview.points >= 0 ? '+' : ''}{bulkPointsPreview.points} pts each
					</span>
				</div>
				<button
					on:click={submitBulkGrade}
					disabled={bulkSubmitting}
					class="btn-primary px-6"
				>
					{bulkSubmitting ? 'Grading...' : `Grade ${selectedIds.size} Item${selectedIds.size !== 1 ? 's' : ''}`}
				</button>
			</div>

			{#if bulkError}
				<div class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
					{bulkError}
				</div>
			{/if}

			<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
				<!-- Price Accuracy -->
				<div>
					<div class="flex justify-between mb-1">
						<label class="text-sm font-medium text-gray-700">Price Accuracy <span class="text-gray-400">(40%)</span></label>
						<span class="text-sm font-bold {getGradeColor(bulkPriceAccuracy)}">{bulkPriceAccuracy}</span>
					</div>
					<input
						type="range"
						min="1"
						max="5"
						bind:value={bulkPriceAccuracy}
						class="w-full h-2 rounded-lg appearance-none cursor-pointer"
						style="background: {getSliderGradient()}"
					/>
					<div class="flex justify-between text-xs text-gray-400 mt-0.5">
						<span>Poor</span>
						<span>Excellent</span>
					</div>
				</div>

				<!-- Justification Quality -->
				<div>
					<div class="flex justify-between mb-1">
						<label class="text-sm font-medium text-gray-700">Justification <span class="text-gray-400">(30%)</span></label>
						<span class="text-sm font-bold {getGradeColor(bulkJustificationQuality)}">{bulkJustificationQuality}</span>
					</div>
					<input
						type="range"
						min="1"
						max="5"
						bind:value={bulkJustificationQuality}
						class="w-full h-2 rounded-lg appearance-none cursor-pointer"
						style="background: {getSliderGradient()}"
					/>
					<div class="flex justify-between text-xs text-gray-400 mt-0.5">
						<span>Poor</span>
						<span>Excellent</span>
					</div>
				</div>

				<!-- Photo Quality -->
				<div>
					<div class="flex justify-between mb-1">
						<label class="text-sm font-medium text-gray-700">Photo Quality <span class="text-gray-400">(30%)</span></label>
						<span class="text-sm font-bold {getGradeColor(bulkPhotoQuality)}">{bulkPhotoQuality}</span>
					</div>
					<input
						type="range"
						min="1"
						max="5"
						bind:value={bulkPhotoQuality}
						class="w-full h-2 rounded-lg appearance-none cursor-pointer"
						style="background: {getSliderGradient()}"
					/>
					<div class="flex justify-between text-xs text-gray-400 mt-0.5">
						<span>Poor</span>
						<span>Excellent</span>
					</div>
				</div>

				<!-- Feedback -->
				<div>
					<label class="text-sm font-medium text-gray-700 block mb-1">Feedback (Optional)</label>
					<input
						type="text"
						bind:value={bulkFeedback}
						class="input w-full text-sm"
						placeholder="Shared feedback for all..."
					/>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: white;
		border: 3px solid #4f46e5;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0,0,0,0.2);
	}

	input[type="range"]::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: white;
		border: 3px solid #4f46e5;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0,0,0,0.2);
	}
</style>
