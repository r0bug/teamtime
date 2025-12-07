<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let reportType: 'time' | 'expenses' = 'time';
	let startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
	let endDate = new Date().toISOString().split('T')[0];

	function downloadReport(format: 'csv' | 'json') {
		const params = new URLSearchParams({
			start: startDate,
			end: endDate,
			format
		});
		window.open(`/api/reports/${reportType}?${params.toString()}`, '_blank');
	}
</script>

<svelte:head>
	<title>Reports - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<h1 class="text-2xl font-bold mb-6">Reports</h1>

	<!-- Report Type Selection -->
	<div class="flex space-x-2 mb-6">
		<button
			on:click={() => reportType = 'time'}
			class="px-4 py-2 rounded-lg font-medium {reportType === 'time' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Time Report
		</button>
		<button
			on:click={() => reportType = 'expenses'}
			class="px-4 py-2 rounded-lg font-medium {reportType === 'expenses' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Expense Report
		</button>
	</div>

	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Generate Report</h2>
		</div>
		<div class="card-body">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
				<div>
					<label for="startDate" class="label">Start Date</label>
					<input type="date" id="startDate" bind:value={startDate} class="input" />
				</div>
				<div>
					<label for="endDate" class="label">End Date</label>
					<input type="date" id="endDate" bind:value={endDate} class="input" />
				</div>
			</div>

			<div class="flex flex-col lg:flex-row gap-4">
				<button on:click={() => downloadReport('csv')} class="btn-primary flex-1">
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					Download CSV
				</button>
				<button on:click={() => downloadReport('json')} class="btn-secondary flex-1">
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
					</svg>
					Download JSON
				</button>
			</div>
		</div>
	</div>

	<!-- Quick Stats -->
	{#if reportType === 'time'}
		<div class="card">
			<div class="card-header">
				<h2 class="font-semibold">Time Summary</h2>
			</div>
			<div class="card-body">
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-gray-900">{data.timeStats?.totalHours?.toFixed(1) || 0}</p>
						<p class="text-sm text-gray-600">Total Hours</p>
					</div>
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-gray-900">{data.timeStats?.totalEntries || 0}</p>
						<p class="text-sm text-gray-600">Clock Events</p>
					</div>
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-gray-900">{data.timeStats?.avgHoursPerDay?.toFixed(1) || 0}</p>
						<p class="text-sm text-gray-600">Avg Hours/Day</p>
					</div>
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-gray-900">{data.timeStats?.activeEmployees || 0}</p>
						<p class="text-sm text-gray-600">Active Employees</p>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="card">
			<div class="card-header">
				<h2 class="font-semibold">Expense Summary</h2>
			</div>
			<div class="card-body">
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-gray-900">${data.expenseStats?.totalWithdrawn?.toFixed(2) || 0}</p>
						<p class="text-sm text-gray-600">Total Withdrawn</p>
					</div>
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-green-600">${data.expenseStats?.totalAllocated?.toFixed(2) || 0}</p>
						<p class="text-sm text-gray-600">Allocated</p>
					</div>
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-yellow-600">${data.expenseStats?.unallocated?.toFixed(2) || 0}</p>
						<p class="text-sm text-gray-600">Unallocated</p>
					</div>
					<div class="text-center p-4 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-gray-900">{data.expenseStats?.withdrawalCount || 0}</p>
						<p class="text-sm text-gray-600">Withdrawals</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
