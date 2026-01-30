<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let startDate = data.startDate;
	let endDate = data.endDate;
	let isRecomputing = false;

	function applyFilters() {
		const params = new URLSearchParams();
		params.set('start', startDate);
		params.set('end', endDate);
		goto(`/admin/metrics/staffing-analytics?${params.toString()}`);
	}

	function setQuickRange(days: number) {
		const end = new Date();
		const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
		startDate = start.toISOString().split('T')[0];
		endDate = end.toISOString().split('T')[0];
		applyFilters();
	}

	async function recompute() {
		isRecomputing = true;
		const params = new URLSearchParams();
		params.set('start', startDate);
		params.set('end', endDate);
		params.set('recompute', 'true');
		goto(`/admin/metrics/staffing-analytics?${params.toString()}`);
	}

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
	}

	function formatPercent(value: number) {
		return `${value >= 0 ? '+' : ''}${Math.round(value)}%`;
	}

	function exportCSV() {
		let csv = 'Type,Name,Metric,Value\n';

		// Worker pairs
		for (const pair of data.pairs) {
			csv += `"Pair","${pair.userName1} + ${pair.userName2}","Avg Daily Sales",${pair.avgDailySales}\n`;
			csv += `"Pair","${pair.userName1} + ${pair.userName2}","Days Together",${pair.daysTogether}\n`;
		}

		// Efficiency
		for (const worker of data.efficiency) {
			csv += `"Efficiency","${worker.userName}","$/Hour",${worker.salesPerHour}\n`;
			csv += `"Efficiency","${worker.userName}","Total Hours",${worker.totalHoursWorked}\n`;
		}

		// Impact
		for (const worker of data.impact) {
			csv += `"Impact","${worker.userName}","Sales Impact",${worker.salesImpact}\n`;
			csv += `"Impact","${worker.userName}","Confidence",${worker.impactConfidence}\n`;
		}

		// Staffing Levels
		for (const level of data.staffingLevels) {
			csv += `"Staffing Level","${level.workerCount} workers","Avg Daily Sales",${level.avgDailySales}\n`;
		}

		// Day of Week
		for (const day of data.dayOfWeek) {
			csv += `"Day of Week","${day.dayName}","Avg Daily Sales",${day.avgDailySales}\n`;
		}

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `staffing-analytics-${startDate}-to-${endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Find optimal staffing level
	$: optimalLevel = data.staffingLevels.length > 0
		? [...data.staffingLevels].sort((a, b) => b.avgDailySales - a.avgDailySales)[0]
		: null;

	// Find best day
	$: bestDay = data.dayOfWeek.length > 0
		? [...data.dayOfWeek].sort((a, b) => b.avgDailySales - a.avgDailySales)[0]
		: null;

	// Chart scaling
	$: maxStaffingSales = Math.max(...data.staffingLevels.map(l => l.avgDailySales), 1);
	$: maxDaySales = Math.max(...data.dayOfWeek.map(d => d.avgDailySales), 1);
</script>

<svelte:head>
	<title>Staffing Analytics - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<!-- Header -->
	<div class="flex flex-wrap justify-between items-center mb-6 gap-4">
		<div>
			<div class="flex items-center gap-2 mb-1">
				<a href="/admin/metrics" class="text-primary-600 hover:text-primary-700">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
				</a>
				<h1 class="text-2xl font-bold text-gray-900">Staffing Analytics</h1>
			</div>
			<p class="text-gray-600">Optimize team scheduling with data-driven insights</p>
		</div>
		<div class="flex gap-2">
			<button on:click={exportCSV} class="btn-secondary text-sm">
				<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				Export CSV
			</button>
			<button on:click={recompute} disabled={isRecomputing} class="btn-primary text-sm">
				{#if isRecomputing}
					<svg class="w-4 h-4 mr-1 inline animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Computing...
				{:else}
					<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					Recompute
				{/if}
			</button>
		</div>
	</div>

	{#if data.recomputed}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6">
			Analytics recomputed successfully for {startDate} to {endDate}
		</div>
	{/if}

	<!-- Date Filter Card -->
	<div class="card mb-6">
		<div class="p-4">
			<div class="flex flex-wrap items-end gap-4 mb-4">
				<div>
					<label for="startDate" class="label">Start Date</label>
					<input type="date" id="startDate" bind:value={startDate} class="input" />
				</div>
				<div>
					<label for="endDate" class="label">End Date</label>
					<input type="date" id="endDate" bind:value={endDate} class="input" />
				</div>
				<button on:click={applyFilters} class="btn-primary">
					Apply
				</button>
			</div>
			<div class="flex flex-wrap gap-2">
				<button on:click={() => setQuickRange(7)} class="text-sm text-primary-600 hover:text-primary-700">Last 7 days</button>
				<button on:click={() => setQuickRange(30)} class="text-sm text-primary-600 hover:text-primary-700">Last 30 days</button>
				<button on:click={() => setQuickRange(90)} class="text-sm text-primary-600 hover:text-primary-700">Last 90 days</button>
			</div>
		</div>
	</div>

	<!-- Key Insights Panel -->
	{#if data.insights.length > 0}
		<div class="card mb-6 bg-gradient-to-r from-blue-50 to-indigo-50">
			<div class="p-4 border-b border-blue-100">
				<h2 class="font-semibold text-blue-900 flex items-center gap-2">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
					</svg>
					Key Insights
				</h2>
			</div>
			<div class="p-4">
				<ul class="space-y-3">
					{#each data.insights as insight}
						<li class="flex items-start gap-3">
							<span class="flex-shrink-0 mt-0.5">
								{#if insight.priority === 'high'}
									<span class="inline-block w-2 h-2 bg-red-500 rounded-full"></span>
								{:else if insight.priority === 'medium'}
									<span class="inline-block w-2 h-2 bg-yellow-500 rounded-full"></span>
								{:else}
									<span class="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
								{/if}
							</span>
							<span class="text-gray-700">{insight.message}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	<!-- Main Grid -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
		<!-- Best Worker Pairs -->
		<div class="card">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Best Worker Pairs</h2>
				<p class="text-sm text-gray-500">Employees who perform best together</p>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pair</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg/Day</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#if data.pairs.length === 0}
							<tr>
								<td colspan="4" class="px-4 py-8 text-center text-gray-500">
									No pair data available. Run recompute to generate analytics.
								</td>
							</tr>
						{:else}
							{#each data.pairs as pair, i}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 text-gray-500">{i + 1}</td>
									<td class="px-4 py-3 font-medium">
										{pair.userName1} + {pair.userName2}
									</td>
									<td class="px-4 py-3 text-right">{pair.daysTogether}</td>
									<td class="px-4 py-3 text-right font-semibold text-green-600">
										{formatCurrency(pair.avgDailySales)}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Worker Impact Analysis -->
		<div class="card">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Worker Impact Analysis</h2>
				<p class="text-sm text-gray-500">Sales difference when worker present vs absent</p>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Present</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Absent</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Impact</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#if data.impact.length === 0}
							<tr>
								<td colspan="4" class="px-4 py-8 text-center text-gray-500">
									No impact data available. Run recompute to generate analytics.
								</td>
							</tr>
						{:else}
							{#each data.impact as worker}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 font-medium">{worker.userName}</td>
									<td class="px-4 py-3 text-right">{formatCurrency(worker.avgSalesWhenPresent)}</td>
									<td class="px-4 py-3 text-right text-gray-500">{formatCurrency(worker.avgSalesWhenAbsent)}</td>
									<td class="px-4 py-3 text-right font-semibold {worker.salesImpact >= 0 ? 'text-green-600' : 'text-red-600'}">
										{worker.salesImpact >= 0 ? '+' : ''}{formatCurrency(worker.salesImpact)}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Worker Efficiency -->
		<div class="card">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Worker Efficiency</h2>
				<p class="text-sm text-gray-500">Sales per hour worked</p>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">$/Hour</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#if data.efficiency.length === 0}
							<tr>
								<td colspan="4" class="px-4 py-8 text-center text-gray-500">
									No efficiency data available. Run recompute to generate analytics.
								</td>
							</tr>
						{:else}
							{#each data.efficiency as worker, i}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 text-gray-500">{i + 1}</td>
									<td class="px-4 py-3 font-medium">{worker.userName}</td>
									<td class="px-4 py-3 text-right">{worker.totalHoursWorked.toFixed(1)}h</td>
									<td class="px-4 py-3 text-right font-semibold text-purple-600">
										{formatCurrency(worker.salesPerHour)}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Staffing Level Optimization -->
		<div class="card">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Staffing Optimization</h2>
				<p class="text-sm text-gray-500">Average daily sales by worker count</p>
			</div>
			<div class="p-4">
				{#if data.staffingLevels.length === 0}
					<div class="text-center text-gray-500 py-8">
						No staffing level data available. Run recompute to generate analytics.
					</div>
				{:else}
					<div class="flex items-end gap-2 h-48">
						{#each data.staffingLevels as level}
							<div class="flex flex-col items-center flex-1">
								<div class="relative w-full flex flex-col items-center" style="height: 160px;">
									<div
										class="absolute bottom-0 w-full rounded-t transition-all {optimalLevel && level.workerCount === optimalLevel.workerCount ? 'bg-green-500' : 'bg-blue-400'}"
										style="height: {(level.avgDailySales / maxStaffingSales) * 100}%"
										title="Avg: {formatCurrency(level.avgDailySales)}"
									></div>
								</div>
								<div class="text-xs text-gray-600 mt-2 font-medium">{level.workerCount}</div>
								<div class="text-xs text-gray-400">workers</div>
							</div>
						{/each}
					</div>
					{#if optimalLevel}
						<div class="mt-4 text-center text-sm text-gray-600">
							Optimal: <span class="font-semibold text-green-600">{optimalLevel.workerCount} workers</span>
							= {formatCurrency(optimalLevel.avgDailySales)}/day avg
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	<!-- Day of Week Patterns (Full Width) -->
	<div class="card">
		<div class="p-4 border-b">
			<h2 class="font-semibold">Day of Week Patterns</h2>
			<p class="text-sm text-gray-500">Average sales by day of week</p>
		</div>
		<div class="p-4">
			{#if data.dayOfWeek.length === 0}
				<div class="text-center text-gray-500 py-8">
					No day of week data available. Run recompute to generate analytics.
				</div>
			{:else}
				<div class="flex items-end gap-4 h-48 justify-center">
					{#each data.dayOfWeek as day}
						<div class="flex flex-col items-center w-20">
							<div class="text-xs text-gray-500 mb-1">{formatCurrency(day.avgDailySales)}</div>
							<div class="relative w-full flex flex-col items-center" style="height: 140px;">
								<div
									class="absolute bottom-0 w-full rounded-t transition-all {bestDay && day.dayOfWeek === bestDay.dayOfWeek ? 'bg-green-500' : 'bg-indigo-400'}"
									style="height: {(day.avgDailySales / maxDaySales) * 100}%"
								></div>
							</div>
							<div class="text-sm text-gray-700 mt-2 font-medium">{day.dayName.slice(0, 3)}</div>
							<div class="text-xs text-gray-400">{day.avgWorkerCount.toFixed(1)} avg staff</div>
						</div>
					{/each}
				</div>
				{#if bestDay}
					<div class="mt-4 text-center text-sm text-gray-600">
						Best day: <span class="font-semibold text-green-600">{bestDay.dayName}</span>
						averaging {formatCurrency(bestDay.avgDailySales)}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
