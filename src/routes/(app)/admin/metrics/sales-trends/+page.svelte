<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let startDate = data.startDate;
	let endDate = data.endDate;
	let periodType = data.periodType;
	let vendorFilters = [...data.vendorFilters];
	let employeeFilters = [...data.employeeFilters];

	function applyFilters() {
		const params = new URLSearchParams();
		params.set('start', startDate);
		params.set('end', endDate);
		params.set('period', periodType);
		for (const v of vendorFilters) {
			params.append('vendor', v);
		}
		for (const e of employeeFilters) {
			params.append('employee', e);
		}
		goto(`/admin/metrics/sales-trends?${params.toString()}`);
	}

	function setQuickRange(days: number) {
		const end = new Date();
		const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
		startDate = start.toISOString().split('T')[0];
		endDate = end.toISOString().split('T')[0];
		applyFilters();
	}

	function toggleVendor(vendorId: string) {
		if (vendorFilters.includes(vendorId)) {
			vendorFilters = vendorFilters.filter(v => v !== vendorId);
		} else {
			vendorFilters = [...vendorFilters, vendorId];
		}
	}

	function toggleEmployee(employeeId: string) {
		if (employeeFilters.includes(employeeId)) {
			employeeFilters = employeeFilters.filter(e => e !== employeeId);
		} else {
			employeeFilters = [...employeeFilters, employeeId];
		}
	}

	function clearFilters() {
		vendorFilters = [];
		employeeFilters = [];
		applyFilters();
	}

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
	}

	function exportCSV() {
		let csv = 'Period,Total Sales,Retained,Hours Worked,Sales/Hour,Employee Count\n';
		for (const row of data.trendData) {
			csv += `"${row.periodLabel}",${row.totalSales},${row.retained},${row.hoursWorked},${row.salesPerHour},${row.employeeCount}\n`;
		}
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sales-trends-${startDate}-to-${endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Calculate max values for chart scaling
	$: maxSales = Math.max(...data.trendData.map(d => d.totalSales), 1);
	$: maxRetained = Math.max(...data.trendData.map(d => d.retained), 1);
</script>

<svelte:head>
	<title>Sales Trends - TeamTime</title>
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
				<h1 class="text-2xl font-bold text-gray-900">Sales Trends</h1>
			</div>
			<p class="text-gray-600">Track sales performance over time</p>
		</div>
		<button on:click={exportCSV} class="btn-primary text-sm">
			<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
			Export CSV
		</button>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-gray-900">{formatCurrency(data.summary.totalSales)}</p>
			<p class="text-sm text-gray-600">Total Sales</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-green-600">{formatCurrency(data.summary.totalRetained)}</p>
			<p class="text-sm text-gray-600">Total Retained</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-blue-600">{data.summary.totalHours.toFixed(1)}h</p>
			<p class="text-sm text-gray-600">Total Hours</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-purple-600">{formatCurrency(data.summary.avgSalesPerHour)}/hr</p>
			<p class="text-sm text-gray-600">Avg Retained/Hr</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold {data.summary.trend >= 0 ? 'text-green-600' : 'text-red-600'}">
				{data.summary.trend >= 0 ? '+' : ''}{data.summary.trend}%
			</p>
			<p class="text-sm text-gray-600">Trend</p>
		</div>
	</div>

	<!-- Filters -->
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
				<div>
					<label for="periodType" class="label">Aggregation</label>
					<select id="periodType" bind:value={periodType} class="input">
						<option value="daily">Daily</option>
						<option value="weekly">Weekly</option>
						<option value="monthly">Monthly</option>
					</select>
				</div>
				<button on:click={applyFilters} class="btn-primary">
					Apply
				</button>
				{#if vendorFilters.length > 0 || employeeFilters.length > 0}
					<button on:click={clearFilters} class="btn-secondary text-sm">
						Clear Filters
					</button>
				{/if}
			</div>
			<div class="flex flex-wrap gap-2 mb-4">
				<button on:click={() => setQuickRange(7)} class="text-sm text-primary-600 hover:text-primary-700">Last 7 days</button>
				<button on:click={() => setQuickRange(30)} class="text-sm text-primary-600 hover:text-primary-700">Last 30 days</button>
				<button on:click={() => setQuickRange(90)} class="text-sm text-primary-600 hover:text-primary-700">Last 90 days</button>
				<button on:click={() => setQuickRange(180)} class="text-sm text-primary-600 hover:text-primary-700">Last 6 months</button>
			</div>

			<!-- Multi-select filters -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<div>
					<label class="label">Filter by Vendor</label>
					<div class="flex flex-wrap gap-2 mt-1">
						{#each data.vendorList.slice(0, 10) as vendor}
							<button
								on:click={() => toggleVendor(vendor.id)}
								class="px-2 py-1 text-xs rounded-full border transition-colors
									{vendorFilters.includes(vendor.id)
										? 'bg-primary-600 text-white border-primary-600'
										: 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}"
							>
								{vendor.name}
							</button>
						{/each}
						{#if data.vendorList.length > 10}
							<span class="text-xs text-gray-500 self-center">+{data.vendorList.length - 10} more</span>
						{/if}
					</div>
				</div>
				<div>
					<label class="label">Filter by Employee (show sales when working)</label>
					<div class="flex flex-wrap gap-2 mt-1">
						{#each data.employeeList as emp}
							<button
								on:click={() => toggleEmployee(emp.id)}
								class="px-2 py-1 text-xs rounded-full border transition-colors
									{employeeFilters.includes(emp.id)
										? 'bg-primary-600 text-white border-primary-600'
										: 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}"
							>
								{emp.name}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Simple Bar Chart -->
	<div class="card mb-6">
		<div class="p-4 border-b">
			<h2 class="font-semibold">Sales Over Time</h2>
		</div>
		<div class="p-4">
			{#if data.trendData.length === 0}
				<div class="text-center text-gray-500 py-8">
					No data available for the selected date range
				</div>
			{:else}
				<div class="flex items-end gap-1 h-48 overflow-x-auto pb-2">
					{#each data.trendData as point}
						<div class="flex flex-col items-center min-w-[40px] flex-1 max-w-[80px]">
							<div class="relative w-full flex flex-col items-center" style="height: 160px;">
								<!-- Retained bar (darker) -->
								<div
									class="absolute bottom-0 w-3/4 bg-green-500 rounded-t transition-all"
									style="height: {(point.retained / maxSales) * 100}%"
									title="Retained: {formatCurrency(point.retained)}"
								></div>
								<!-- Total sales bar (lighter, behind) -->
								<div
									class="absolute bottom-0 w-full bg-green-200 rounded-t transition-all -z-10"
									style="height: {(point.totalSales / maxSales) * 100}%"
									title="Total: {formatCurrency(point.totalSales)}"
								></div>
							</div>
							<div class="text-xs text-gray-500 mt-1 truncate w-full text-center" title={point.periodLabel}>
								{point.periodLabel}
							</div>
						</div>
					{/each}
				</div>
				<div class="flex gap-4 justify-center mt-4 text-sm">
					<div class="flex items-center gap-1">
						<div class="w-3 h-3 bg-green-200 rounded"></div>
						<span class="text-gray-600">Total Sales</span>
					</div>
					<div class="flex items-center gap-1">
						<div class="w-3 h-3 bg-green-500 rounded"></div>
						<span class="text-gray-600">Retained</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Data Table -->
	<div class="card">
		<div class="p-4 border-b">
			<h2 class="font-semibold">Trend Data</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Sales</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Retained</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">$/Hour</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Staff</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if data.trendData.length === 0}
						<tr>
							<td colspan="6" class="px-4 py-8 text-center text-gray-500">
								No trend data for this date range
							</td>
						</tr>
					{:else}
						{#each data.trendData as row}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
									{row.periodLabel}
								</td>
								<td class="px-4 py-3 text-right">{formatCurrency(row.totalSales)}</td>
								<td class="px-4 py-3 text-right text-green-600 font-medium">{formatCurrency(row.retained)}</td>
								<td class="px-4 py-3 text-right">{row.hoursWorked.toFixed(1)}h</td>
								<td class="px-4 py-3 text-right font-medium {row.salesPerHour >= data.summary.avgSalesPerHour ? 'text-green-600' : 'text-gray-600'}">
									{formatCurrency(row.salesPerHour)}
								</td>
								<td class="px-4 py-3 text-right">{row.employeeCount}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
