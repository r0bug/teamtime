<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let detailView: 'hourly' | 'vendors' | 'items' = 'hourly';

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	}

	function formatCurrencyShort(value: number): string {
		if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
		return `$${value.toFixed(0)}`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T12:00:00');
		return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatHour(hour: number): string {
		if (hour === 0) return '12 AM';
		if (hour < 12) return `${hour} AM`;
		if (hour === 12) return '12 PM';
		return `${hour - 12} PM`;
	}

	function formatTime(isoStr: string): string {
		const d = new Date(isoStr);
		return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
	}

	function navigateDate(date: string) {
		const params = new URLSearchParams({ date });
		if (data.selectedVendorId) params.set('vendorId', String(data.selectedVendorId));
		goto(`/sales/detail?${params}`);
	}

	function filterByVendor(vendorId: number | null) {
		const params = new URLSearchParams({ date: data.date });
		if (vendorId) params.set('vendorId', String(vendorId));
		goto(`/sales/detail?${params}`);
	}

	// Hourly chart calculations
	$: maxHourlySales = Math.max(...data.hourly.map(h => h.totalSales), 1);
	$: totalItems = data.totals.itemCount;
	// "Has data" now includes the case where we only have labor cost but no
	// sales yet (e.g. a day currently in progress before the first sale).
	$: hasData = data.totals.itemCount > 0 || data.totals.labor > 0 || data.hourly.length > 0;

	// Find prev/next available dates
	$: currentDateIndex = data.availableDates.indexOf(data.date);
	$: prevDate = currentDateIndex < data.availableDates.length - 1 ? data.availableDates[currentDateIndex + 1] : null;
	$: nextDate = currentDateIndex > 0 ? data.availableDates[currentDateIndex - 1] : null;
</script>

<svelte:head>
	<title>Sales Detail - {formatDate(data.date)} - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<!-- Header -->
	<div class="mb-6">
		<div class="flex items-center gap-2 text-sm text-gray-500 mb-2">
			<a href="/dashboard" class="hover:text-primary-600 transition-colors">Home</a>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
			<a href="/sales" class="hover:text-primary-600 transition-colors">Sales</a>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
			<span class="text-gray-900">Detail</span>
		</div>
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Sales Detail</h1>
				<p class="text-gray-600">Transaction-level drill-down</p>
			</div>
		</div>
	</div>

	<!-- Date Navigation -->
	<div class="flex items-center justify-between mb-6">
		<button
			on:click={() => prevDate && navigateDate(prevDate)}
			disabled={!prevDate}
			class="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			&larr; Previous
		</button>

		<div class="flex items-center gap-3">
			<select
				value={data.date}
				on:change={(e) => navigateDate(e.currentTarget.value)}
				class="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500"
			>
				{#each data.availableDates as d}
					<option value={d}>{formatDate(d)}</option>
				{/each}
			</select>

			{#if data.selectedVendorId}
				<button
					on:click={() => filterByVendor(null)}
					class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200"
				>
					Vendor #{data.selectedVendorId} &times;
				</button>
			{/if}
		</div>

		<button
			on:click={() => nextDate && navigateDate(nextDate)}
			disabled={!nextDate}
			class="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			Next &rarr;
		</button>
	</div>

	{#if !hasData}
		<div class="card">
			<div class="card-body text-center py-12">
				<p class="text-gray-500 text-lg">No transaction data for {formatDate(data.date)}</p>
				<p class="text-gray-400 text-sm mt-2">Transaction details are stored when importing via the NRS API.</p>
				{#if data.availableDates.length > 0}
					<p class="text-gray-400 text-sm mt-1">
						Try: <button on:click={() => navigateDate(data.availableDates[0])} class="text-primary-600 hover:underline">{formatDate(data.availableDates[0])}</button>
					</p>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Summary Cards -->
		<div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
			<div class="card">
				<div class="card-body text-center">
					<p class="text-xl lg:text-2xl font-bold text-blue-600">{formatCurrency(data.totals.totalSales)}</p>
					<p class="text-xs text-gray-600">Total Sales</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body text-center">
					<p class="text-xl lg:text-2xl font-bold text-orange-600">{formatCurrency(data.totals.vendorPortion)}</p>
					<p class="text-xs text-gray-600">Vendor Payout</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body text-center">
					<p class="text-xl lg:text-2xl font-bold text-green-600">{formatCurrency(data.totals.retained)}</p>
					<p class="text-xs text-gray-600">Retained</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body text-center">
					<p class="text-xl lg:text-2xl font-bold text-red-600">{formatCurrency(data.totals.labor)}</p>
					<p class="text-xs text-gray-600">Labor Cost</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body text-center">
					<p class="text-xl lg:text-2xl font-bold {data.totals.net >= 0 ? 'text-emerald-600' : 'text-red-700'}">{formatCurrency(data.totals.net)}</p>
					<p class="text-xs text-gray-600">Net (Retained − Labor)</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body text-center">
					<p class="text-xl lg:text-2xl font-bold text-gray-700">{data.totals.itemCount}</p>
					<p class="text-xs text-gray-600">Items Sold</p>
				</div>
			</div>
		</div>

		{#if data.laborMeta.unknownRateEntries > 0}
			<div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
				{data.laborMeta.unknownRateEntries} time {data.laborMeta.unknownRateEntries === 1 ? 'entry' : 'entries'} excluded from labor cost — user has no hourly rate configured.
			</div>
		{/if}

		<!-- Detail Tabs -->
		<div class="card mb-6">
			<div class="border-b border-gray-200">
				<nav class="flex -mb-px">
					<button
						on:click={() => (detailView = 'hourly')}
						class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {detailView === 'hourly'
							? 'border-primary-500 text-primary-600'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					>
						Hourly
					</button>
					<button
						on:click={() => (detailView = 'vendors')}
						class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {detailView === 'vendors'
							? 'border-primary-500 text-primary-600'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					>
						Vendors
					</button>
					<button
						on:click={() => (detailView = 'items')}
						class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {detailView === 'items'
							? 'border-primary-500 text-primary-600'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					>
						Items
					</button>
				</nav>
			</div>

			<!-- Hourly View -->
			{#if detailView === 'hourly'}
				<div class="card-body">
					<h3 class="font-semibold text-gray-900 mb-4">Sales by Hour</h3>

					<!-- Hourly bar chart -->
					<div class="space-y-2">
						{#each data.hourly as h}
							{@const barWidth = (h.totalSales / maxHourlySales) * 100}
							{@const retainedWidth = (h.retained / maxHourlySales) * 100}
							<div class="flex items-center gap-3">
								<div class="w-16 text-right text-sm font-medium text-gray-600">{formatHour(h.hour)}</div>
								<div class="flex-1">
									<div class="relative bg-gray-100 rounded-full h-7 overflow-hidden">
										<div
											class="absolute inset-y-0 left-0 bg-blue-200 rounded-full"
											style="width: {barWidth}%"
										></div>
										<div
											class="absolute inset-y-0 left-0 bg-green-500 rounded-full"
											style="width: {retainedWidth}%"
										></div>
										{#if barWidth > 25}
											<span class="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-gray-800">
												{formatCurrencyShort(h.totalSales)}
											</span>
										{/if}
									</div>
								</div>
								<div class="w-20 text-right text-xs text-gray-500">
									{h.itemCount} items
								</div>
							</div>
						{/each}
					</div>

					{#if data.hourly.length === 0}
						<p class="text-gray-500 text-center py-8">No hourly data available</p>
					{/if}

					<!-- Legend -->
					<div class="flex items-center justify-center gap-6 mt-4 text-xs">
						<div class="flex items-center gap-1">
							<div class="w-3 h-3 rounded-full bg-blue-200"></div>
							<span class="text-gray-600">Total Sales</span>
						</div>
						<div class="flex items-center gap-1">
							<div class="w-3 h-3 rounded-full bg-green-500"></div>
							<span class="text-gray-600">Retained</span>
						</div>
					</div>

					<!-- Hourly data table -->
					<div class="mt-6 overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="border-b border-gray-200">
									<th class="text-left py-2 px-3 font-medium text-gray-600">Hour</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Sales</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Vendor Payout</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Retained</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Labor</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Net</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Items</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Vendors</th>
								</tr>
							</thead>
							<tbody>
								{#each data.hourly as h}
									<tr class="border-b border-gray-100 hover:bg-gray-50">
										<td class="py-2 px-3 font-medium">{formatHour(h.hour)}</td>
										<td class="py-2 px-3 text-right text-blue-600">{formatCurrency(h.totalSales)}</td>
										<td class="py-2 px-3 text-right text-gray-600">{formatCurrency(h.vendorPortion)}</td>
										<td class="py-2 px-3 text-right text-green-600 font-medium">{formatCurrency(h.retained)}</td>
										<td class="py-2 px-3 text-right text-red-600">{formatCurrency(h.labor)}</td>
										<td class="py-2 px-3 text-right font-medium {h.net >= 0 ? 'text-emerald-600' : 'text-red-700'}">{formatCurrency(h.net)}</td>
										<td class="py-2 px-3 text-right text-gray-500">{h.itemCount}</td>
										<td class="py-2 px-3 text-right text-gray-500">{h.vendorCount}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- Vendors View -->
			{#if detailView === 'vendors'}
				<div class="card-body">
					<h3 class="font-semibold text-gray-900 mb-4">Vendor Breakdown</h3>

					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="border-b border-gray-200">
									<th class="text-left py-2 px-3 font-medium text-gray-600">#</th>
									<th class="text-left py-2 px-3 font-medium text-gray-600">Vendor</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Sales</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Vendor Payout</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Retained</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Margin</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Items</th>
									<th class="text-center py-2 px-3 font-medium text-gray-600"></th>
								</tr>
							</thead>
							<tbody>
								{#each data.vendors as v, i}
									{@const margin = v.totalSales > 0 ? (v.retained / v.totalSales) * 100 : 0}
									<tr class="border-b border-gray-100 hover:bg-gray-50 {data.selectedVendorId === v.vendorId ? 'bg-blue-50' : ''}">
										<td class="py-2 px-3 text-gray-400">#{i + 1}</td>
										<td class="py-2 px-3 font-medium">
											<button
												on:click={() => filterByVendor(v.vendorId)}
												class="text-left hover:text-primary-600 hover:underline"
											>
												{v.vendorName}
											</button>
										</td>
										<td class="py-2 px-3 text-right text-blue-600">{formatCurrency(v.totalSales)}</td>
										<td class="py-2 px-3 text-right text-gray-600">{formatCurrency(v.vendorPortion)}</td>
										<td class="py-2 px-3 text-right text-green-600 font-medium">{formatCurrency(v.retained)}</td>
										<td class="py-2 px-3 text-right text-gray-500">{margin.toFixed(1)}%</td>
										<td class="py-2 px-3 text-right text-gray-500">{v.itemCount}</td>
										<td class="py-2 px-3 text-center">
											<button
												on:click={() => filterByVendor(v.vendorId)}
												class="text-xs text-primary-600 hover:underline"
											>
												drill in
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if data.vendors.length === 0}
						<p class="text-gray-500 text-center py-8">No vendor data available</p>
					{/if}
				</div>
			{/if}

			<!-- Items View -->
			{#if detailView === 'items'}
				<div class="card-body">
					<h3 class="font-semibold text-gray-900 mb-4">
						Individual Transactions
						{#if data.selectedVendorId}
							<span class="text-sm font-normal text-gray-500">(filtered by vendor)</span>
						{/if}
					</h3>

					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="border-b border-gray-200">
									<th class="text-left py-2 px-3 font-medium text-gray-600">Time</th>
									<th class="text-left py-2 px-3 font-medium text-gray-600">Vendor</th>
									<th class="text-left py-2 px-3 font-medium text-gray-600">Item</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Qty</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Price</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Total</th>
									<th class="text-right py-2 px-3 font-medium text-gray-600">Retained</th>
									<th class="text-left py-2 px-3 font-medium text-gray-600">Cashier</th>
								</tr>
							</thead>
							<tbody>
								{#each data.items as item}
									<tr class="border-b border-gray-100 hover:bg-gray-50">
										<td class="py-2 px-3 text-gray-500 whitespace-nowrap">{formatTime(item.time)}</td>
										<td class="py-2 px-3">
											<button
												on:click={() => filterByVendor(item.vendorId)}
												class="hover:text-primary-600 hover:underline truncate max-w-[120px] block"
												title={item.vendorName || ''}
											>
												{item.vendorName || `#${item.vendorId}`}
											</button>
										</td>
										<td class="py-2 px-3 truncate max-w-[200px]" title={item.itemDescription}>
											{item.itemDescription || item.partNumber || '-'}
										</td>
										<td class="py-2 px-3 text-right">{item.quantity}</td>
										<td class="py-2 px-3 text-right">{formatCurrency(item.price)}</td>
										<td class="py-2 px-3 text-right text-blue-600">{formatCurrency(item.totalPrice)}</td>
										<td class="py-2 px-3 text-right text-green-600">{formatCurrency(item.retained)}</td>
										<td class="py-2 px-3 text-gray-500 truncate max-w-[100px]">{item.userName || '-'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if data.items.length === 0}
						<p class="text-gray-500 text-center py-8">No items found</p>
					{:else if data.items.length >= 50}
						<p class="text-gray-400 text-center text-xs mt-4">Showing first 50 items. Use the API for full data.</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
