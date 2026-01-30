<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let startDate = data.startDate;
	let endDate = data.endDate;
	let periodType = data.periodType;
	let employeeFilter = data.employeeFilter;
	let vendorFilter = data.vendorFilter;
	let sortColumn = 'date';
	let sortDirection: 'asc' | 'desc' = 'desc';

	function applyFilters() {
		const params = new URLSearchParams({
			start: startDate,
			end: endDate,
			period: periodType
		});
		if (employeeFilter) params.set('employee', employeeFilter);
		if (vendorFilter) params.set('vendor', vendorFilter);
		goto(`/admin/metrics/vendor-correlations?${params.toString()}`);
	}

	function setQuickRange(days: number) {
		const end = new Date();
		const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
		startDate = start.toISOString().split('T')[0];
		endDate = end.toISOString().split('T')[0];
		applyFilters();
	}

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
	}

	function getDeltaColor(delta: number): string {
		if (delta > 10) return 'text-green-600 bg-green-50';
		if (delta > 0) return 'text-green-600';
		if (delta < -10) return 'text-red-600 bg-red-50';
		if (delta < 0) return 'text-red-600';
		return 'text-gray-600';
	}

	function sortBy(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'desc';
		}
	}

	$: sortedData = [...data.correlations].sort((a, b) => {
		const aVal = a[sortColumn as keyof typeof a];
		const bVal = b[sortColumn as keyof typeof b];
		const modifier = sortDirection === 'asc' ? 1 : -1;
		if (typeof aVal === 'string') {
			return aVal.localeCompare(bVal as string) * modifier;
		}
		return ((aVal as number) - (bVal as number)) * modifier;
	});

	function exportCSV() {
		let csv = 'Period,Employee,Vendor,Hours Worked,Vendor Sales,Attributed Sales,Delta %\n';
		for (const row of sortedData) {
			csv += `"${row.periodLabel}","${row.employeeName}","${row.vendorName}",${row.hoursWorked},${row.vendorSales},${row.attribution},${row.deltaPercent}\n`;
		}
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `vendor-correlations-${startDate}-to-${endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Vendor Correlations - TeamTime</title>
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
				<h1 class="text-2xl font-bold text-gray-900">Vendor-Employee Correlations</h1>
			</div>
			<p class="text-gray-600">Analyze sales performance relative to staff hours worked</p>
		</div>
		<button on:click={exportCSV} class="btn-primary text-sm">
			<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
			Export CSV
		</button>
	</div>

	<!-- Info Panel -->
	<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
		<p class="text-sm text-blue-800">
			<strong>Delta %</strong> shows how an employee's sales-per-hour compares to the average for that vendor.
			<span class="text-green-600 font-medium">Green</span> indicates above-average performance,
			<span class="text-red-600 font-medium">Red</span> indicates below-average.
		</p>
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
					<label for="periodType" class="label">Period</label>
					<select id="periodType" bind:value={periodType} class="input">
						<option value="daily">Daily</option>
						<option value="weekly">Weekly</option>
						<option value="monthly">Monthly</option>
					</select>
				</div>
				<div>
					<label for="employeeFilter" class="label">Employee</label>
					<select id="employeeFilter" bind:value={employeeFilter} class="input">
						<option value="">All Employees</option>
						{#each data.employeeList as emp}
							<option value={emp.id}>{emp.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="vendorFilter" class="label">Vendor</label>
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
			</div>
		</div>
	</div>

	<!-- Correlations Table -->
	<div class="card">
		<div class="p-4 border-b flex justify-between items-center">
			<h2 class="font-semibold">Correlation Data</h2>
			<span class="text-sm text-gray-500">{sortedData.length} records</span>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('date')}
						>
							Period {sortColumn === 'date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('employeeName')}
						>
							Employee {sortColumn === 'employeeName' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('vendorName')}
						>
							Vendor {sortColumn === 'vendorName' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('hoursWorked')}
						>
							Hours {sortColumn === 'hoursWorked' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('vendorSales')}
						>
							Vendor Sales {sortColumn === 'vendorSales' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('attribution')}
						>
							Attributed {sortColumn === 'attribution' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
							on:click={() => sortBy('deltaPercent')}
						>
							Delta % {sortColumn === 'deltaPercent' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if sortedData.length === 0}
						<tr>
							<td colspan="7" class="px-4 py-8 text-center text-gray-500">
								<div class="space-y-3">
									<p>No correlation data for this date range.</p>
									{#if data.debugInfo}
										<div class="bg-gray-100 rounded-lg p-4 text-left max-w-md mx-auto">
											<p class="font-medium text-gray-700 mb-2">Debug Info:</p>
											<ul class="text-sm space-y-1">
												<li>Sales snapshots found: <span class="font-mono">{data.debugInfo.snapshotsFound}</span></li>
												<li>Time entries found: <span class="font-mono">{data.debugInfo.timeEntriesFound}</span></li>
												<li>Dates with hours: <span class="font-mono">{data.debugInfo.uniqueDatesWithHours}</span></li>
												<li>Vendors in snapshots: <span class="font-mono">{data.debugInfo.vendorsInSnapshots}</span></li>
											</ul>
											{#if data.debugInfo.snapshotsFound === 0}
												<p class="mt-3 text-amber-600 text-sm">No sales snapshots found. Import sales data first.</p>
											{:else if data.debugInfo.timeEntriesFound === 0}
												<p class="mt-3 text-amber-600 text-sm">No time entries found. Employees need to clock in/out.</p>
											{:else if data.debugInfo.uniqueDatesWithHours === 0}
												<p class="mt-3 text-amber-600 text-sm">Time entries don't overlap with snapshot dates.</p>
											{/if}
										</div>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						{#each sortedData as row}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{row.periodLabel}
								</td>
								<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
									{row.employeeName}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-gray-600">
									{row.vendorName}
								</td>
								<td class="px-4 py-3 text-right whitespace-nowrap">
									{row.hoursWorked.toFixed(1)}h
								</td>
								<td class="px-4 py-3 text-right whitespace-nowrap">
									{formatCurrency(row.vendorSales)}
								</td>
								<td class="px-4 py-3 text-right whitespace-nowrap font-medium">
									{formatCurrency(row.attribution)}
								</td>
								<td class="px-4 py-3 text-right whitespace-nowrap">
									<span class="px-2 py-1 rounded font-medium {getDeltaColor(row.deltaPercent)}">
										{row.deltaPercent > 0 ? '+' : ''}{row.deltaPercent.toFixed(1)}%
									</span>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
