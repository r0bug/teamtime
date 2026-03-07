<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
	}

	function formatDate(dateStr: string) {
		return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatDateTime(isoStr: string) {
		return new Date(isoStr).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function timeAgo(isoStr: string): string {
		const diff = Date.now() - new Date(isoStr).getTime();
		const hours = Math.floor(diff / (1000 * 60 * 60));
		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days === 1) return 'yesterday';
		return `${days} days ago`;
	}

	function goToPage(p: number) {
		goto(`/admin/metrics/data-sources?page=${p}`);
	}

	$: lastScrape = data.snapshots.length > 0 ? data.snapshots[0].capturedAt : null;
	$: scrapeHealth = data.gaps.length === 0 ? 'healthy' : data.gaps.length <= 3 ? 'warning' : 'critical';
</script>

<svelte:head>
	<title>NRS Sales Data Sources - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex flex-wrap justify-between items-center mb-6 gap-4">
		<div>
			<div class="flex items-center gap-2 mb-1">
				<a href="/admin/metrics" class="text-primary-600 hover:text-primary-700">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
				</a>
				<h1 class="text-2xl font-bold text-gray-900">NRS Sales Data</h1>
			</div>
			<p class="text-gray-600">Scrape history and data health from NRS cron imports</p>
		</div>
		<div class="flex items-center gap-3">
			{#if lastScrape}
				<span class="text-sm text-gray-500">Last scrape: {timeAgo(lastScrape)}</span>
			{/if}
			<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium
				{scrapeHealth === 'healthy' ? 'bg-green-100 text-green-700' :
				 scrapeHealth === 'warning' ? 'bg-yellow-100 text-yellow-700' :
				 'bg-red-100 text-red-700'}">
				<span class="w-2 h-2 rounded-full
					{scrapeHealth === 'healthy' ? 'bg-green-500' :
					 scrapeHealth === 'warning' ? 'bg-yellow-500' :
					 'bg-red-500'}"></span>
				{scrapeHealth === 'healthy' ? 'All Good' :
				 scrapeHealth === 'warning' ? 'Some Gaps' :
				 'Missing Data'}
			</span>
		</div>
	</div>

	<!-- Overview Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-gray-900">{data.pagination.total}</p>
			<p class="text-sm text-gray-600">Total Scrapes</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-blue-600">{data.uniqueDays}</p>
			<p class="text-sm text-gray-600">Unique Days</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-green-600">
				{formatCurrency(data.sourceStats.reduce((s, st) => s + st.totalRetained, 0))}
			</p>
			<p class="text-sm text-gray-600">Total Retained (All Time)</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold {data.gaps.length === 0 ? 'text-green-600' : 'text-red-600'}">
				{data.gaps.length}
			</p>
			<p class="text-sm text-gray-600">Missing Days (30d)</p>
		</div>
	</div>

	<!-- Source Stats -->
	{#if data.sourceStats.length > 0}
		<div class="card mb-6">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Data Sources</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Scrapes</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Date Range</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sales</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Retained</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Vendors</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Scrape</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each data.sourceStats as source}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3">
									<span class="inline-flex items-center gap-1.5">
										<span class="w-2 h-2 rounded-full {source.source === 'scraper' ? 'bg-blue-500' : source.source === 'manual' ? 'bg-purple-500' : 'bg-gray-400'}"></span>
										<span class="font-medium text-gray-900">{source.source}</span>
									</span>
								</td>
								<td class="px-4 py-3 text-right">{source.scrapeCount}</td>
								<td class="px-4 py-3 text-right text-sm text-gray-600">
									{formatDate(source.earliestDate)} - {formatDate(source.latestDate)}
								</td>
								<td class="px-4 py-3 text-right">{formatCurrency(source.totalSales)}</td>
								<td class="px-4 py-3 text-right text-green-600 font-medium">{formatCurrency(source.totalRetained)}</td>
								<td class="px-4 py-3 text-right">{source.avgVendorCount}</td>
								<td class="px-4 py-3 text-right text-sm text-gray-600">
									{formatDateTime(source.lastScrape)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Data Gaps Warning -->
	{#if data.gaps.length > 0}
		<div class="card mb-6 border-l-4 {data.gaps.length <= 3 ? 'border-l-yellow-400' : 'border-l-red-400'}">
			<div class="p-4">
				<h3 class="font-semibold text-gray-900 mb-2">
					Missing Data ({data.gaps.length} days in last 30)
				</h3>
				<p class="text-sm text-gray-600 mb-3">
					No NRS scrape data found for these dates (Sundays excluded):
				</p>
				<div class="flex flex-wrap gap-2">
					{#each data.gaps as gap}
						<span class="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-md font-mono">
							{gap}
						</span>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Daily Scrape Frequency (last 30 days) -->
	{#if data.dailyScrapes.length > 0}
		<div class="card mb-6">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Scrape Frequency (Last 30 Days)</h2>
			</div>
			<div class="p-4">
				<div class="flex items-end gap-1 h-32 overflow-x-auto pb-2">
					{#each data.dailyScrapes.slice().reverse() as day}
						{@const maxCount = Math.max(...data.dailyScrapes.map(d => d.scrapeCount), 1)}
						<div class="flex flex-col items-center min-w-[24px] flex-1 max-w-[40px]" title="{day.date}: {day.scrapeCount} scrape(s)">
							<div class="relative w-full flex justify-center" style="height: 100px;">
								<div
									class="absolute bottom-0 w-3/4 rounded-t transition-all
										{day.scrapeCount >= 2 ? 'bg-green-500' :
										 day.scrapeCount === 1 ? 'bg-blue-500' :
										 'bg-red-300'}"
									style="height: {(day.scrapeCount / maxCount) * 100}%"
								></div>
							</div>
							<div class="text-[10px] text-gray-400 mt-1 -rotate-45 origin-top-left whitespace-nowrap">
								{new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
							</div>
						</div>
					{/each}
				</div>
				<div class="flex gap-4 justify-center mt-6 text-xs text-gray-500">
					<div class="flex items-center gap-1">
						<div class="w-3 h-3 bg-green-500 rounded"></div>
						<span>2+ scrapes</span>
					</div>
					<div class="flex items-center gap-1">
						<div class="w-3 h-3 bg-blue-500 rounded"></div>
						<span>1 scrape</span>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Scrape History Table -->
	<div class="card">
		<div class="p-4 border-b flex justify-between items-center">
			<h2 class="font-semibold">Scrape History</h2>
			<span class="text-sm text-gray-500">
				Showing {(data.pagination.page - 1) * data.pagination.perPage + 1}-{Math.min(data.pagination.page * data.pagination.perPage, data.pagination.total)} of {data.pagination.total}
			</span>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale Date</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Captured</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sales</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Vendor Payout</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Retained</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Vendors</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI Run</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#if data.snapshots.length === 0}
						<tr>
							<td colspan="8" class="px-4 py-8 text-center text-gray-500">
								No scrape data found
							</td>
						</tr>
					{:else}
						{#each data.snapshots as snapshot}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
									{formatDate(snapshot.saleDate)}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{formatDateTime(snapshot.capturedAt)}
								</td>
								<td class="px-4 py-3">
									<span class="px-2 py-0.5 text-xs rounded-full
										{snapshot.source === 'scraper' ? 'bg-blue-100 text-blue-700' :
										 snapshot.source === 'manual' ? 'bg-purple-100 text-purple-700' :
										 'bg-gray-100 text-gray-700'}">
										{snapshot.source || 'unknown'}
									</span>
								</td>
								<td class="px-4 py-3 text-right">{formatCurrency(snapshot.totalSales)}</td>
								<td class="px-4 py-3 text-right text-gray-600">{formatCurrency(snapshot.totalVendorAmount)}</td>
								<td class="px-4 py-3 text-right text-green-600 font-medium">{formatCurrency(snapshot.totalRetained)}</td>
								<td class="px-4 py-3 text-right">{snapshot.vendorCount}</td>
								<td class="px-4 py-3 text-sm">
									{#if snapshot.aiRunId}
										<span class="text-xs text-purple-600 font-mono">{snapshot.aiRunId.slice(0, 8)}</span>
									{:else}
										<span class="text-gray-400">-</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if data.pagination.totalPages > 1}
			<div class="p-4 border-t flex justify-center gap-2">
				<button
					on:click={() => goToPage(data.pagination.page - 1)}
					disabled={data.pagination.page <= 1}
					class="px-3 py-1 text-sm rounded border {data.pagination.page <= 1 ? 'text-gray-300 border-gray-200' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}"
				>
					Prev
				</button>
				{#each Array.from({ length: Math.min(data.pagination.totalPages, 7) }, (_, i) => {
					// Show first, last, and pages around current
					const totalPages = data.pagination.totalPages;
					const current = data.pagination.page;
					if (totalPages <= 7) return i + 1;
					if (i === 0) return 1;
					if (i === 6) return totalPages;
					if (i === 1 && current > 4) return -1; // ellipsis
					if (i === 5 && current < totalPages - 3) return -1; // ellipsis
					return Math.max(2, Math.min(totalPages - 1, current - 2 + i));
				}) as pageNum}
					{#if pageNum === -1}
						<span class="px-2 py-1 text-gray-400">...</span>
					{:else}
						<button
							on:click={() => goToPage(pageNum)}
							class="px-3 py-1 text-sm rounded border {pageNum === data.pagination.page ? 'bg-primary-600 text-white border-primary-600' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}"
						>
							{pageNum}
						</button>
					{/if}
				{/each}
				<button
					on:click={() => goToPage(data.pagination.page + 1)}
					disabled={data.pagination.page >= data.pagination.totalPages}
					class="px-3 py-1 text-sm rounded border {data.pagination.page >= data.pagination.totalPages ? 'text-gray-300 border-gray-200' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}"
				>
					Next
				</button>
			</div>
		{/if}
	</div>
</div>
