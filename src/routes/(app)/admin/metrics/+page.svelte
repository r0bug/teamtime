<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let startDate = data.startDate;
	let endDate = data.endDate;
	let metricType = data.metricType;
	let userFilter = data.userFilter;
	let vendorFilter = data.vendorFilter;
	let sortColumn = 'date';
	let sortDirection: 'asc' | 'desc' = 'desc';

	function applyFilters() {
		const params = new URLSearchParams({
			start: startDate,
			end: endDate,
			metric: metricType
		});
		if (userFilter) params.set('user', userFilter);
		if (vendorFilter) params.set('vendor', vendorFilter);
		goto(`/admin/metrics?${params.toString()}`);
	}

	function setQuickRange(days: number) {
		const end = new Date();
		const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
		startDate = start.toISOString().split('T')[0];
		endDate = end.toISOString().split('T')[0];
		applyFilters();
	}

	function setThisMonth() {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		startDate = start.toISOString().split('T')[0];
		endDate = end.toISOString().split('T')[0];
		applyFilters();
	}

	function exportCSV() {
		let csv = 'Date,Total Sales,Retained,Vendor Amount,Vendor Count,Hours Worked,Employees,Sales/Hour\n';
		for (const row of sortedData) {
			csv += `${row.date},${row.totalSales.toFixed(2)},${row.retained.toFixed(2)},${row.vendorAmount.toFixed(2)},${row.vendorCount},${row.hoursWorked.toFixed(2)},${row.employeeCount},${row.salesPerHour.toFixed(2)}\n`;
		}
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `metrics-${startDate}-to-${endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function formatDate(date: string) {
		return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
	}

	function sortBy(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'desc';
		}
	}

	$: sortedData = [...data.metricsData].sort((a, b) => {
		const aVal = a[sortColumn as keyof typeof a];
		const bVal = b[sortColumn as keyof typeof b];
		const modifier = sortDirection === 'asc' ? 1 : -1;
		if (typeof aVal === 'string') {
			return aVal.localeCompare(bVal as string) * modifier;
		}
		return ((aVal as number) - (bVal as number)) * modifier;
	});
</script>

<svelte:head>
	<title>Metrics Dashboard - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex flex-wrap justify-between items-center mb-6 gap-4">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Metrics Dashboard</h1>
			<p class="text-gray-600 mt-1">Track sales, hours, and performance metrics</p>
		</div>
		<div class="flex gap-2">
			<a href="/admin/metrics/vendor-correlations" class="btn-secondary text-sm">
				Vendor Correlations
			</a>
			<a href="/admin/metrics/sales-trends" class="btn-secondary text-sm">
				Sales Trends
			</a>
			<a href="/admin/metrics/data-sources" class="btn-secondary text-sm">
				Data Sources
			</a>
			<button on:click={exportCSV} class="btn-primary text-sm">
				<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				Export CSV
			</button>
		</div>
	</div>

	<!-- Filters -->
	<div class="card mb-6">
		<div class="p-4">
			<div class="flex flex-wrap items-end gap-4">
				<div>
					<label for="startDate" class="label">Start Date</label>
					<input type="date" id="startDate" bind:value={startDate} class="input" />
				</div>
				<div>
					<label for="endDate" class="label">End Date</label>
					<input type="date" id="endDate" bind:value={endDate} class="input" />
				</div>
				<div>
					<label for="metricType" class="label">Metric Type</label>
					<select id="metricType" bind:value={metricType} class="input">
						<option value="sales">Sales</option>
						<option value="hours">Hours</option>
						<option value="combined">Combined</option>
					</select>
				</div>
				<div>
					<label for="userFilter" class="label">User Filter</label>
					<select id="userFilter" bind:value={userFilter} class="input">
						<option value="">All Users</option>
						{#each data.usersList as user}
							<option value={user.id}>{user.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="vendorFilter" class="label">Vendor Filter</label>
					<select id="vendorFilter" bind:value={vendorFilter} class="input">
						<option value="">All Vendors</option>
						{#each data.vendorList as vendor}
							<option value={vendor.id}>{vendor.name}</option>
						{/each}
					</select>
				</div>
				<button on:click={applyFilters} class="btn-primary">
					Apply
				</button>
			</div>
			<div class="flex flex-wrap gap-2 mt-3">
				<button on:click={() => setQuickRange(7)} class="text-sm text-primary-600 hover:text-primary-700">Last 7 days</button>
				<button on:click={() => setQuickRange(30)} class="text-sm text-primary-600 hover:text-primary-700">Last 30 days</button>
				<button on:click={() => setQuickRange(90)} class="text-sm text-primary-600 hover:text-primary-700">Last 90 days</button>
				<button on:click={setThisMonth} class="text-sm text-primary-600 hover:text-primary-700">This Month</button>
			</div>
		</div>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
			<p class="text-sm text-gray-600">Total Hours Worked</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-purple-600">{formatCurrency(data.summary.avgRetainedPerHour)}/hr</p>
			<p class="text-sm text-gray-600">Avg Retained/Hour</p>
		</div>
	</div>

	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-gray-900">{data.summary.daysWithData}</p>
			<p class="text-sm text-gray-600">Days with Data</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-gray-900">{data.summary.employeeCount}</p>
			<p class="text-sm text-gray-600">Active Employees</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-gray-900">{formatCurrency(data.summary.avgSalesPerDay)}</p>
			<p class="text-sm text-gray-600">Avg Sales/Day</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-gray-900">{formatCurrency(data.summary.totalVendorAmount)}</p>
			<p class="text-sm text-gray-600">Vendor Payments</p>
		</div>
	</div>

	<!-- Metrics Table -->
	<div class="card">
		<div class="p-4 border-b">
			<h2 class="font-semibold">Daily Metrics</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('date')}
						>
							Date {sortColumn === 'date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('totalSales')}
						>
							Total Sales {sortColumn === 'totalSales' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('retained')}
						>
							Retained {sortColumn === 'retained' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('vendorCount')}
						>
							Vendors {sortColumn === 'vendorCount' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('hoursWorked')}
						>
							Hours {sortColumn === 'hoursWorked' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('employeeCount')}
						>
							Staff {sortColumn === 'employeeCount' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('salesPerHour')}
						>
							$/Hour {sortColumn === 'salesPerHour' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if sortedData.length === 0}
						<tr>
							<td colspan="7" class="px-4 py-8 text-center text-gray-500">
								No metrics data for this date range
							</td>
						</tr>
					{:else}
						{#each sortedData as row}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
									{formatDate(row.date)}
								</td>
								<td class="px-4 py-3 text-right">{formatCurrency(row.totalSales)}</td>
								<td class="px-4 py-3 text-right text-green-600 font-medium">{formatCurrency(row.retained)}</td>
								<td class="px-4 py-3 text-right">{row.vendorCount}</td>
								<td class="px-4 py-3 text-right">{row.hoursWorked.toFixed(1)}h</td>
								<td class="px-4 py-3 text-right">{row.employeeCount}</td>
								<td class="px-4 py-3 text-right font-medium {row.salesPerHour >= data.summary.avgRetainedPerHour ? 'text-green-600' : 'text-gray-600'}">
									{formatCurrency(row.salesPerHour)}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Top Vendors Section -->
	{#if data.vendorList.length > 0}
		<div class="card mt-6">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Top Vendors</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Sales</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Days Active</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Avg/Day</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.vendorList.slice(0, 10) as vendor}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 font-medium text-gray-900">{vendor.name}</td>
								<td class="px-4 py-3 text-right">{formatCurrency(vendor.totalSales)}</td>
								<td class="px-4 py-3 text-right">{vendor.daysActive}</td>
								<td class="px-4 py-3 text-right">{formatCurrency(vendor.totalSales / vendor.daysActive)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
