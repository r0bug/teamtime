<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let startDate = data.dateRange.startDate;
	let endDate = data.dateRange.endDate;

	function formatPrice(price: string | number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(typeof price === 'string' ? parseFloat(price) : price);
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function updateDateRange() {
		const params = new URLSearchParams();
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);
		goto(`/admin/pricing?${params.toString()}`, { replaceState: true });
	}

	$: storeStats = data.stats.byDestination.find(d => d.destination === 'store') || { count: 0, value: '0' };
	$: ebayStats = data.stats.byDestination.find(d => d.destination === 'ebay') || { count: 0, value: '0' };
</script>

<svelte:head>
	<title>Pricing Analytics - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold">Pricing Analytics</h1>
			<p class="text-gray-600 mt-1">Overview of item pricing activity</p>
		</div>
		<a href="/pricing" class="btn-secondary">
			View All Decisions
		</a>
	</div>

	<!-- Date Range Filter -->
	<div class="card mb-6">
		<div class="card-body">
			<div class="flex flex-wrap items-end gap-4">
				<div>
					<label for="startDate" class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
					<input
						type="date"
						id="startDate"
						bind:value={startDate}
						class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
					/>
				</div>
				<div>
					<label for="endDate" class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
					<input
						type="date"
						id="endDate"
						bind:value={endDate}
						class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
					/>
				</div>
				<button on:click={updateDateRange} class="btn-primary">
					Apply Filter
				</button>
			</div>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
		<!-- Total -->
		<div class="card">
			<div class="card-body">
				<div class="text-sm font-medium text-gray-500 mb-1">Total Items Priced</div>
				<div class="text-3xl font-bold text-gray-900">{data.stats.total.count}</div>
				<div class="text-lg text-primary-600 font-semibold">{formatPrice(data.stats.total.value)}</div>
			</div>
		</div>

		<!-- Store -->
		<div class="card border-l-4 border-green-500">
			<div class="card-body">
				<div class="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
					<svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
					</svg>
					Store Items
				</div>
				<div class="text-3xl font-bold text-gray-900">{storeStats.count}</div>
				<div class="text-lg text-green-600 font-semibold">{formatPrice(storeStats.value)}</div>
			</div>
		</div>

		<!-- eBay -->
		<div class="card border-l-4 border-blue-500">
			<div class="card-body">
				<div class="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
					<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
					</svg>
					eBay Items
				</div>
				<div class="text-3xl font-bold text-gray-900">{ebayStats.count}</div>
				<div class="text-lg text-blue-600 font-semibold">{formatPrice(ebayStats.value)}</div>
			</div>
		</div>
	</div>

	<!-- By User Table -->
	<div class="card mb-6">
		<div class="card-body">
			<h2 class="text-lg font-semibold mb-4">Activity by User</h2>
			{#if data.stats.byUser.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b">
								<th class="text-left py-2 px-4 font-medium text-gray-700">User</th>
								<th class="text-right py-2 px-4 font-medium text-gray-700">Items</th>
								<th class="text-right py-2 px-4 font-medium text-gray-700">Total Value</th>
								<th class="text-right py-2 px-4 font-medium text-gray-700">Avg Price</th>
							</tr>
						</thead>
						<tbody>
							{#each data.stats.byUser as user}
								<tr class="border-b last:border-0 hover:bg-gray-50">
									<td class="py-2 px-4">{user.userName}</td>
									<td class="py-2 px-4 text-right">{user.count}</td>
									<td class="py-2 px-4 text-right font-medium">{formatPrice(user.value)}</td>
									<td class="py-2 px-4 text-right text-gray-500">
										{formatPrice(parseFloat(user.value) / user.count)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="text-gray-500 text-center py-4">No pricing activity in this date range</p>
			{/if}
		</div>
	</div>

	<!-- Recent Decisions -->
	<div class="card">
		<div class="card-body">
			<h2 class="text-lg font-semibold mb-4">Recent Pricing Decisions</h2>
			{#if data.recentDecisions.length > 0}
				<div class="space-y-3">
					{#each data.recentDecisions as decision}
						<a href="/pricing/{decision.id}" class="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
							<div class="flex items-center justify-between">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<span class="px-2 py-0.5 text-xs font-medium rounded-full {decision.destination === 'ebay' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
											{decision.destination === 'ebay' ? 'eBay' : 'Store'}
										</span>
										<span class="text-sm text-gray-500">{decision.userName}</span>
									</div>
									<p class="font-medium text-gray-900 truncate">{decision.itemDescription}</p>
									<p class="text-sm text-gray-500">{formatDate(decision.pricedAt)}</p>
								</div>
								<div class="text-lg font-bold text-primary-600 ml-4">
									{formatPrice(decision.price)}
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500 text-center py-4">No recent pricing decisions</p>
			{/if}
		</div>
	</div>
</div>
