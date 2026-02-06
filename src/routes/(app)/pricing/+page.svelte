<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	type FilterType = 'all' | 'store' | 'ebay';
	let filter: FilterType = 'all';

	const filterTabs: { value: FilterType; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'store', label: 'Store' },
		{ value: 'ebay', label: 'eBay' }
	];

	$: filteredDecisions = filter === 'all'
		? data.decisions
		: data.decisions.filter(d => d.destination === filter);

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
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
</script>

<svelte:head>
	<title>Pricing History - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold">Pricing History</h1>
			<p class="text-gray-600 mt-1">
				{#if data.isManager}
					All pricing decisions
				{:else}
					Your pricing decisions
				{/if}
			</p>
		</div>
		<a href="/pricing/new" class="btn-primary">
			<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			Price New Item
		</a>
	</div>

	<!-- Filter Tabs -->
	<div class="flex space-x-2 mb-6 overflow-x-auto pb-2">
		{#each filterTabs as tab}
			<button
				on:click={() => filter = tab.value}
				class="px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors {filter === tab.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Decisions List -->
	<div class="space-y-3">
		{#each filteredDecisions as decision}
			<a href="/pricing/{decision.id}" class="card block hover:shadow-md transition-shadow">
				<div class="card-body flex items-center gap-4">
					<!-- Thumbnail -->
					<div class="w-16 h-16 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
						{#if decision.thumbnail}
							<img
								src="{decision.thumbnail}?w=128"
								alt={decision.itemDescription}
								class="w-full h-full object-cover"
								loading="lazy"
							/>
						{:else}
							<div class="w-full h-full flex items-center justify-center text-gray-400">
								<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
							</div>
						{/if}
					</div>

					<!-- Details -->
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-1">
							<span class="px-2 py-0.5 text-xs font-medium rounded-full {decision.destination === 'ebay' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
								{decision.destination === 'ebay' ? 'eBay' : 'Store'}
							</span>
							<span class="text-lg font-bold text-primary-600">{formatPrice(decision.price)}</span>
						</div>
						<h3 class="font-medium text-gray-900 truncate">{decision.itemDescription}</h3>
						<div class="flex items-center gap-4 mt-1 text-sm text-gray-500">
							{#if data.isManager && decision.userName}
								<span>By {decision.userName}</span>
							{/if}
							<span>{formatDate(decision.pricedAt)}</span>
						</div>
					</div>

					<!-- Arrow -->
					<svg class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</div>
			</a>
		{:else}
			<div class="text-center py-12">
				<svg class="mx-auto w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<p class="mt-2 text-gray-600">No pricing decisions found</p>
				<a href="/pricing/new" class="btn-primary inline-flex mt-4">
					Price Your First Item
				</a>
			</div>
		{/each}
	</div>
</div>
