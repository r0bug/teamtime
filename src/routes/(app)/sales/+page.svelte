<script lang="ts">
	import { browser } from '$app/environment';
	import type { PageData } from './$types';

	export let data: PageData;

	// View mode: daily, weekly, vendor
	let viewMode: 'daily' | 'weekly' | 'vendor' = 'daily';

	// Date range filter
	let daysToShow = 14;

	$: filteredDailyData = data.salesData.slice(-daysToShow);
	$: filteredWeeklyData = data.weeklyData;

	// Chart dimensions
	const chartHeight = 200;
	const chartPadding = { top: 20, right: 20, bottom: 30, left: 60 };

	// Calculate chart scales for daily data
	$: dailyMaxValue = Math.max(...filteredDailyData.map(d => Math.max(d.totalSales, d.totalRetained)), 1);
	$: dailyChartWidth = browser ? Math.min(800, window.innerWidth - 48) : 800;

	// SVG path generators
	function generateLinePath(
		data: Array<{ value: number }>,
		maxValue: number,
		width: number,
		height: number
	): string {
		if (data.length === 0) return '';

		const usableWidth = width - chartPadding.left - chartPadding.right;
		const usableHeight = height - chartPadding.top - chartPadding.bottom;
		const xStep = usableWidth / Math.max(data.length - 1, 1);

		return data
			.map((d, i) => {
				const x = chartPadding.left + i * xStep;
				const y = chartPadding.top + usableHeight - (d.value / maxValue) * usableHeight;
				return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
			})
			.join(' ');
	}

	function generateAreaPath(
		data: Array<{ value: number }>,
		maxValue: number,
		width: number,
		height: number
	): string {
		if (data.length === 0) return '';

		const usableWidth = width - chartPadding.left - chartPadding.right;
		const usableHeight = height - chartPadding.top - chartPadding.bottom;
		const xStep = usableWidth / Math.max(data.length - 1, 1);
		const baseline = chartPadding.top + usableHeight;

		const points = data.map((d, i) => {
			const x = chartPadding.left + i * xStep;
			const y = chartPadding.top + usableHeight - (d.value / maxValue) * usableHeight;
			return { x, y };
		});

		const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
		const closePath = `L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;

		return linePath + closePath;
	}

	// Format currency
	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(value);
	}

	function formatCurrencyShort(value: number): string {
		if (value >= 1000) {
			return `$${(value / 1000).toFixed(1)}k`;
		}
		return `$${value.toFixed(0)}`;
	}

	// Format date for display
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T12:00:00');
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatWeek(weekStart: string): string {
		const date = new Date(weekStart + 'T12:00:00');
		const endDate = new Date(date);
		endDate.setDate(endDate.getDate() + 6);
		return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
	}

	// Tooltip state
	let tooltipData: { x: number; y: number; date: string; sales: number; retained: number } | null = null;

	function showTooltip(event: MouseEvent, day: typeof filteredDailyData[0], index: number) {
		const rect = (event.target as Element).getBoundingClientRect();
		tooltipData = {
			x: rect.left + rect.width / 2,
			y: rect.top - 10,
			date: day.date,
			sales: day.totalSales,
			retained: day.totalRetained
		};
	}

	function hideTooltip() {
		tooltipData = null;
	}
</script>

<svelte:head>
	<title>Sales Dashboard - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<!-- Header with Navigation -->
	<div class="mb-6">
		<div class="flex items-center gap-2 text-sm text-gray-500 mb-2">
			<a href="/dashboard" class="hover:text-primary-600 transition-colors">Home</a>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
			<span class="text-gray-900">Sales</span>
		</div>
		<h1 class="text-2xl font-bold text-gray-900">Sales Dashboard</h1>
		<p class="text-gray-600">Track daily and weekly sales performance</p>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl lg:text-3xl font-bold text-green-600">
					{formatCurrency(data.summary.totalRetained)}
				</p>
				<p class="text-sm text-gray-600">Total Retained ({data.summary.daysWithData} days)</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl lg:text-3xl font-bold text-blue-600">
					{formatCurrency(data.summary.totalSales)}
				</p>
				<p class="text-sm text-gray-600">Total Sales</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl lg:text-3xl font-bold text-green-600">
					{formatCurrency(data.summary.avgDailyRetained)}
				</p>
				<p class="text-sm text-gray-600">Avg Daily Retained</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl lg:text-3xl font-bold text-blue-600">
					{formatCurrency(data.summary.avgDailySales)}
				</p>
				<p class="text-sm text-gray-600">Avg Daily Sales</p>
			</div>
		</div>
	</div>

	<!-- View Mode Tabs -->
	<div class="card mb-6">
		<div class="border-b border-gray-200">
			<nav class="flex -mb-px">
				<button
					on:click={() => (viewMode = 'daily')}
					class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {viewMode === 'daily'
						? 'border-primary-500 text-primary-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Daily
				</button>
				<button
					on:click={() => (viewMode = 'weekly')}
					class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {viewMode === 'weekly'
						? 'border-primary-500 text-primary-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Weekly
				</button>
				<button
					on:click={() => (viewMode = 'vendor')}
					class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {viewMode === 'vendor'
						? 'border-primary-500 text-primary-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					By Vendor
				</button>
			</nav>
		</div>

		<!-- Daily View -->
		{#if viewMode === 'daily'}
			<div class="card-body">
				<!-- Date Range Filter -->
				<div class="flex items-center justify-between mb-4">
					<h3 class="font-semibold text-gray-900">Daily Sales & Retained</h3>
					<select
						bind:value={daysToShow}
						class="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500"
					>
						<option value={7}>Last 7 days</option>
						<option value={14}>Last 14 days</option>
						<option value={30}>Last 30 days</option>
					</select>
				</div>

				<!-- Chart -->
				<div class="relative overflow-x-auto">
					<svg width="100%" height={chartHeight} viewBox="0 0 {dailyChartWidth} {chartHeight}" class="overflow-visible">
						<!-- Grid lines -->
						{#each [0, 0.25, 0.5, 0.75, 1] as tick}
							<line
								x1={chartPadding.left}
								y1={chartPadding.top + (chartHeight - chartPadding.top - chartPadding.bottom) * (1 - tick)}
								x2={dailyChartWidth - chartPadding.right}
								y2={chartPadding.top + (chartHeight - chartPadding.top - chartPadding.bottom) * (1 - tick)}
								stroke="#e5e7eb"
								stroke-width="1"
							/>
							<text
								x={chartPadding.left - 8}
								y={chartPadding.top + (chartHeight - chartPadding.top - chartPadding.bottom) * (1 - tick) + 4}
								text-anchor="end"
								class="text-xs fill-gray-500"
							>
								{formatCurrencyShort(dailyMaxValue * tick)}
							</text>
						{/each}

						<!-- Area fill for retained -->
						<path
							d={generateAreaPath(
								filteredDailyData.map((d) => ({ value: d.totalRetained })),
								dailyMaxValue,
								dailyChartWidth,
								chartHeight
							)}
							fill="url(#retainedGradient)"
							opacity="0.3"
						/>

						<!-- Lines -->
						<path
							d={generateLinePath(
								filteredDailyData.map((d) => ({ value: d.totalSales })),
								dailyMaxValue,
								dailyChartWidth,
								chartHeight
							)}
							fill="none"
							stroke="#3b82f6"
							stroke-width="2"
						/>
						<path
							d={generateLinePath(
								filteredDailyData.map((d) => ({ value: d.totalRetained })),
								dailyMaxValue,
								dailyChartWidth,
								chartHeight
							)}
							fill="none"
							stroke="#10b981"
							stroke-width="2"
						/>

						<!-- Data points -->
						{#each filteredDailyData as day, i}
							{@const x =
								chartPadding.left +
								(i * (dailyChartWidth - chartPadding.left - chartPadding.right)) /
									Math.max(filteredDailyData.length - 1, 1)}
							{@const yRetained =
								chartPadding.top +
								(chartHeight - chartPadding.top - chartPadding.bottom) -
								(day.totalRetained / dailyMaxValue) * (chartHeight - chartPadding.top - chartPadding.bottom)}

							<!-- Invisible hit area for tooltip -->
							<rect
								x={x - 15}
								y={chartPadding.top}
								width="30"
								height={chartHeight - chartPadding.top - chartPadding.bottom}
								fill="transparent"
								on:mouseenter={(e) => showTooltip(e, day, i)}
								on:mouseleave={hideTooltip}
								role="button"
								tabindex="0"
							/>

							<!-- Retained point -->
							<circle cx={x} cy={yRetained} r="4" fill="#10b981" />
						{/each}

						<!-- X-axis labels -->
						{#each filteredDailyData as day, i}
							{#if i % Math.ceil(filteredDailyData.length / 7) === 0 || i === filteredDailyData.length - 1}
								{@const x =
									chartPadding.left +
									(i * (dailyChartWidth - chartPadding.left - chartPadding.right)) /
										Math.max(filteredDailyData.length - 1, 1)}
								<text
									x={x}
									y={chartHeight - 5}
									text-anchor="middle"
									class="text-xs fill-gray-500"
								>
									{formatDate(day.date)}
								</text>
							{/if}
						{/each}

						<!-- Gradient definition -->
						<defs>
							<linearGradient id="retainedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
								<stop offset="0%" stop-color="#10b981" />
								<stop offset="100%" stop-color="#10b981" stop-opacity="0" />
							</linearGradient>
						</defs>
					</svg>
				</div>

				<!-- Legend -->
				<div class="flex items-center justify-center gap-6 mt-4 text-sm">
					<div class="flex items-center gap-2">
						<div class="w-3 h-3 rounded-full bg-blue-500"></div>
						<span class="text-gray-600">Total Sales</span>
					</div>
					<div class="flex items-center gap-2">
						<div class="w-3 h-3 rounded-full bg-green-500"></div>
						<span class="text-gray-600">Retained</span>
					</div>
				</div>

				<!-- Data Table -->
				<div class="mt-6 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead>
							<tr class="border-b border-gray-200">
								<th class="text-left py-2 px-3 font-medium text-gray-600">Date</th>
								<th class="text-right py-2 px-3 font-medium text-gray-600">Sales</th>
								<th class="text-right py-2 px-3 font-medium text-gray-600">Vendor Payout</th>
								<th class="text-right py-2 px-3 font-medium text-gray-600">Retained</th>
								<th class="text-right py-2 px-3 font-medium text-gray-600">Vendors</th>
							</tr>
						</thead>
						<tbody>
							{#each [...filteredDailyData].reverse() as day}
								<tr class="border-b border-gray-100 hover:bg-gray-50">
									<td class="py-2 px-3 font-medium">{formatDate(day.date)}</td>
									<td class="py-2 px-3 text-right text-blue-600">{formatCurrency(day.totalSales)}</td>
									<td class="py-2 px-3 text-right text-gray-600">{formatCurrency(day.totalVendorAmount)}</td>
									<td class="py-2 px-3 text-right text-green-600 font-medium">{formatCurrency(day.totalRetained)}</td>
									<td class="py-2 px-3 text-right text-gray-500">{day.vendorCount}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- Weekly View -->
		{#if viewMode === 'weekly'}
			<div class="card-body">
				<h3 class="font-semibold text-gray-900 mb-4">Weekly Summary</h3>

				<!-- Weekly bars -->
				<div class="space-y-4">
					{#each filteredWeeklyData as week}
						{@const maxWeekly = Math.max(...filteredWeeklyData.map((w) => w.totalRetained))}
						{@const barWidth = (week.totalRetained / maxWeekly) * 100}
						<div>
							<div class="flex items-center justify-between mb-1">
								<span class="text-sm font-medium text-gray-700">{formatWeek(week.week)}</span>
								<span class="text-sm text-gray-500">{week.days} days</span>
							</div>
							<div class="flex items-center gap-3">
								<div class="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
									<div
										class="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full flex items-center justify-end pr-2"
										style="width: {barWidth}%"
									>
										{#if barWidth > 30}
											<span class="text-white text-sm font-medium">{formatCurrency(week.totalRetained)}</span>
										{/if}
									</div>
								</div>
								{#if barWidth <= 30}
									<span class="text-sm font-medium text-green-600 w-20 text-right">{formatCurrency(week.totalRetained)}</span>
								{/if}
							</div>
							<div class="text-xs text-gray-500 mt-1">
								Total Sales: {formatCurrency(week.totalSales)}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Vendor View -->
		{#if viewMode === 'vendor'}
			<div class="card-body">
				<h3 class="font-semibold text-gray-900 mb-4">Top Vendors by Sales (Last 30 Days)</h3>

				<div class="space-y-3">
					{#each data.topVendors as vendor, i}
						{@const maxVendor = data.topVendors[0]?.sales || 1}
						{@const barWidth = (vendor.sales / maxVendor) * 100}
						<div class="flex items-center gap-3">
							<div class="w-6 text-center text-sm font-medium text-gray-400">#{i + 1}</div>
							<div class="flex-1">
								<div class="flex items-center justify-between mb-1">
									<span class="text-sm font-medium text-gray-700 truncate">{vendor.name}</span>
									<div class="flex items-center gap-3 text-sm">
										<span class="font-medium text-blue-600">{formatCurrency(vendor.sales)}</span>
										<span class="text-green-600">({formatCurrency(vendor.retained)} retained)</span>
									</div>
								</div>
								<div class="bg-gray-100 rounded-full h-2 overflow-hidden">
									<div
										class="h-full bg-blue-500 rounded-full"
										style="width: {barWidth}%"
									></div>
								</div>
							</div>
						</div>
					{/each}
				</div>

				{#if data.topVendors.length === 0}
					<p class="text-gray-500 text-center py-8">No vendor data available</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Tooltip -->
	{#if tooltipData}
		<div
			class="fixed z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
			style="left: {tooltipData.x}px; top: {tooltipData.y}px"
		>
			<div class="font-medium">{formatDate(tooltipData.date)}</div>
			<div class="text-blue-300">Sales: {formatCurrency(tooltipData.sales)}</div>
			<div class="text-green-300">Retained: {formatCurrency(tooltipData.retained)}</div>
		</div>
	{/if}
</div>
