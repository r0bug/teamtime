<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let filter: 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'reviewed' = 'all';

	$: filteredDrops = filter === 'all'
		? data.drops
		: filter === 'reviewed'
		? data.drops.filter(d => d.reviewedAt !== null)
		: data.drops.filter(d => d.status === filter);

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
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
</script>

<svelte:head>
	<title>Inventory Drops - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold">Inventory Drops</h1>
			<p class="text-gray-600 mt-1">
				{#if data.isManager}
					All inventory drops
				{:else}
					Your inventory drops
				{/if}
			</p>
		</div>
		<a href="/inventory/drops/new" class="btn-primary">
			<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Drop
		</a>
	</div>

	<!-- Filter Tabs -->
	<div class="flex space-x-2 mb-6 overflow-x-auto pb-2">
		{#each [
			{ value: 'all', label: 'All' },
			{ value: 'pending', label: 'Pending' },
			{ value: 'processing', label: 'Processing' },
			{ value: 'completed', label: 'Completed' },
			{ value: 'reviewed', label: 'Reviewed' },
			{ value: 'failed', label: 'Failed' }
		] as tab}
			<button
				on:click={() => { filter = tab.value; }}
				class="px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors {filter === tab.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Drops List -->
	<div class="space-y-3">
		{#each filteredDrops as drop}
			<a href="/inventory/drops/{drop.id}" class="card block hover:shadow-md transition-shadow">
				<div class="card-body flex items-center gap-4">
					<!-- Thumbnail -->
					<div class="w-16 h-16 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
						{#if drop.thumbnail}
							<img
								src={drop.thumbnail}
								alt={drop.description}
								class="w-full h-full object-cover"
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
						<div class="flex items-center gap-2 mb-1 flex-wrap">
							<span class="px-2 py-0.5 text-xs font-medium rounded-full {getStatusColor(drop.status)}">
								{getStatusLabel(drop.status)}
							</span>
							{#if drop.reviewedAt}
								<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
									Reviewed
								</span>
							{/if}
							{#if drop.itemCount && drop.itemCount > 0}
								<span class="text-sm text-gray-600">
									{drop.itemCount - (drop.deletedItemCount || 0)} item{(drop.itemCount - (drop.deletedItemCount || 0)) !== 1 ? 's' : ''}
									{#if drop.deletedItemCount && drop.deletedItemCount > 0}
										<span class="text-gray-400">({drop.deletedItemCount} deleted)</span>
									{/if}
								</span>
							{/if}
						</div>
						<h3 class="font-medium text-gray-900 truncate">{drop.description}</h3>
						<div class="flex items-center gap-4 mt-1 text-sm text-gray-500">
							{#if data.isManager && drop.userName}
								<span>By {drop.userName}</span>
							{/if}
							<span>{formatDate(drop.createdAt)}</span>
						</div>
						{#if drop.status === 'failed' && drop.processingError}
							<p class="text-sm text-red-600 mt-1 truncate">{drop.processingError}</p>
						{/if}
						{#if drop.status === 'processing' || drop.status === 'pending'}
							{@const percent = drop.photosTotal && drop.photosTotal > 0
								? Math.round((drop.photosUploaded / drop.photosTotal) * 50) + (drop.status === 'processing' ? 50 : 0)
								: (drop.status === 'processing' ? 75 : 0)}
							<div class="mt-2 w-full max-w-xs">
								<div class="w-full bg-gray-200 rounded-full h-1.5">
									<div
										class="bg-primary-600 h-1.5 rounded-full transition-all duration-500"
										style="width: {percent}%"
									></div>
								</div>
								<p class="text-xs text-gray-500 mt-0.5">
									{#if drop.status === 'pending' && drop.photosTotal}
										Uploading {drop.photosUploaded ?? 0}/{drop.photosTotal} photos...
									{:else if drop.status === 'processing'}
										AI processing...
									{:else}
										Preparing...
									{/if}
								</p>
							</div>
						{/if}
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
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
				</svg>
				<p class="mt-2 text-gray-600">No inventory drops found</p>
				<a href="/inventory/drops/new" class="btn-primary inline-flex mt-4">
					Create Your First Drop
				</a>
			</div>
		{/each}
	</div>
</div>
