<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let reportType: 'hours' | 'expenses' = (data.reportType as 'hours' | 'expenses') || 'hours';
	let startDate = data.startDate;
	let endDate = data.endDate;
	let showDetail = false;

	function applyFilters() {
		const params = new URLSearchParams({
			start: startDate,
			end: endDate,
			type: reportType
		});
		goto(`/admin/reports?${params.toString()}`);
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

	function setLastMonth() {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const end = new Date(now.getFullYear(), now.getMonth(), 0);
		startDate = start.toISOString().split('T')[0];
		endDate = end.toISOString().split('T')[0];
		applyFilters();
	}

	function printReport() {
		window.print();
	}

	function exportCSV() {
		let csv = '';
		let filename = '';

		if (reportType === 'hours') {
			filename = `employee-hours-${startDate}-to-${endDate}.csv`;
			csv = 'Employee,Email,Hours,Days Worked,Avg Hours/Day,Hourly Rate,Total Pay\n';
			for (const emp of data.employeeHours) {
				csv += `"${emp.name}","${emp.email}",${emp.totalHours.toFixed(2)},${emp.daysWorked},${emp.avgHoursPerDay.toFixed(2)},${emp.hourlyRate || 'N/A'},${emp.totalPay.toFixed(2)}\n`;
			}
		} else {
			filename = `expense-report-${startDate}-to-${endDate}.csv`;
			csv = 'Date,Employee,Amount,Status,Allocated,Unallocated,Notes\n';
			for (const w of data.withdrawals) {
				const date = new Date(w.withdrawnAt).toLocaleDateString();
				csv += `"${date}","${w.userName}",${w.amount.toFixed(2)},"${w.status}",${w.allocatedAmount.toFixed(2)},${w.unallocatedAmount.toFixed(2)},"${w.notes || ''}"\n`;
			}
		}

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatTime(date: Date | string) {
		return new Date(date).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatDateTime(date: Date | string) {
		return `${formatDate(date)} ${formatTime(date)}`;
	}

	function formatHours(hours: number) {
		const h = Math.floor(hours);
		const m = Math.round((hours - h) * 60);
		return `${h}h ${m}m`;
	}
</script>

<svelte:head>
	<title>Reports - TeamTime</title>
	<style>
		@media print {
			.no-print { display: none !important; }
			.print-only { display: block !important; }
			body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
			.card { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; }
			table { font-size: 11px; }
		}
	</style>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex flex-wrap justify-between items-center mb-6 no-print gap-4">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Reports</h1>
			<p class="text-gray-600 mt-1">Generate expense and employee hours reports</p>
		</div>
		<div class="flex gap-2">
			<button on:click={printReport} class="btn-secondary">
				<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
				</svg>
				Print
			</button>
			<button on:click={exportCSV} class="btn-primary">
				<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				Export CSV
			</button>
		</div>
	</div>

	<!-- Print Header -->
	<div class="hidden print-only mb-4">
		<h1 class="text-2xl font-bold text-center">
			{reportType === 'hours' ? 'Employee Hours Report' : 'Expense Report'}
		</h1>
		<p class="text-center text-gray-600">{formatDate(startDate)} - {formatDate(endDate)}</p>
	</div>

	<!-- Report Type Selection -->
	<div class="flex flex-wrap gap-2 mb-4 no-print">
		<button
			on:click={() => { reportType = 'hours'; applyFilters(); }}
			class="px-4 py-2 rounded-lg font-medium transition-colors {reportType === 'hours' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Employee Hours
		</button>
		<button
			on:click={() => { reportType = 'expenses'; applyFilters(); }}
			class="px-4 py-2 rounded-lg font-medium transition-colors {reportType === 'expenses' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Expenses
		</button>
	</div>

	<!-- Pay Period Selection -->
	<div class="card mb-4 no-print">
		<div class="p-4">
			<div class="flex items-center justify-between mb-3">
				<h3 class="font-medium text-gray-900">Pay Periods</h3>
				<a href="/admin/pay-periods" class="text-sm text-primary-600 hover:text-primary-700">Configure</a>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each data.payPeriods as period}
					<button
						on:click={() => {
							startDate = period.startDate;
							endDate = period.endDate;
							applyFilters();
						}}
						class="px-3 py-2 rounded-lg text-sm font-medium transition-colors border
							{startDate === period.startDate && endDate === period.endDate
								? 'bg-primary-600 text-white border-primary-600'
								: period.isCurrent
									? 'bg-primary-50 text-primary-700 border-primary-300 hover:bg-primary-100'
									: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}"
					>
						{period.label}
						{#if period.isCurrent}
							<span class="ml-1 text-xs opacity-75">(Current)</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Date Range Selection -->
	<div class="card mb-6 no-print">
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
				<button on:click={applyFilters} class="btn-primary">
					Apply
				</button>
				<div class="flex flex-wrap gap-2 ml-auto">
					<button on:click={() => setQuickRange(7)} class="text-sm text-primary-600 hover:text-primary-700">Last 7 days</button>
					<button on:click={() => setQuickRange(30)} class="text-sm text-primary-600 hover:text-primary-700">Last 30 days</button>
					<button on:click={setThisMonth} class="text-sm text-primary-600 hover:text-primary-700">This Month</button>
					<button on:click={setLastMonth} class="text-sm text-primary-600 hover:text-primary-700">Last Month</button>
				</div>
			</div>
		</div>
	</div>

	{#if reportType === 'hours'}
		<!-- Hours Report -->

		<!-- Summary Stats -->
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-gray-900">{formatHours(data.hoursSummary.totalHours)}</p>
				<p class="text-sm text-gray-600">Total Hours</p>
			</div>
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-green-600">${data.hoursSummary.totalPay.toFixed(2)}</p>
				<p class="text-sm text-gray-600">Total Pay</p>
			</div>
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-gray-900">{data.hoursSummary.totalEntries}</p>
				<p class="text-sm text-gray-600">Clock Events</p>
			</div>
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-gray-900">{data.hoursSummary.employeeCount}</p>
				<p class="text-sm text-gray-600">Employees</p>
			</div>
		</div>

		<!-- Employee Summary Table -->
		<div class="card mb-6">
			<div class="p-4 border-b flex justify-between items-center">
				<h2 class="font-semibold">Employee Summary</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg/Day</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Pay</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#if data.employeeHours.length === 0}
							<tr>
								<td colspan="6" class="px-4 py-8 text-center text-gray-500">
									No time entries for this date range
								</td>
							</tr>
						{:else}
							{#each data.employeeHours as emp}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3">
										<div class="font-medium text-gray-900">{emp.name}</div>
										<div class="text-xs text-gray-500">{emp.email}</div>
									</td>
									<td class="px-4 py-3 text-right font-medium">{formatHours(emp.totalHours)}</td>
									<td class="px-4 py-3 text-right">{emp.daysWorked}</td>
									<td class="px-4 py-3 text-right">{emp.avgHoursPerDay.toFixed(1)}h</td>
									<td class="px-4 py-3 text-right">{emp.hourlyRate ? `$${emp.hourlyRate.toFixed(2)}` : '-'}</td>
									<td class="px-4 py-3 text-right font-medium text-green-600">
										{emp.hourlyRate ? `$${emp.totalPay.toFixed(2)}` : '-'}
									</td>
								</tr>
							{/each}
							<tr class="bg-gray-100 font-semibold">
								<td class="px-4 py-3">Total</td>
								<td class="px-4 py-3 text-right">{formatHours(data.hoursSummary.totalHours)}</td>
								<td class="px-4 py-3 text-right">-</td>
								<td class="px-4 py-3 text-right">-</td>
								<td class="px-4 py-3 text-right">-</td>
								<td class="px-4 py-3 text-right text-green-600">${data.hoursSummary.totalPay.toFixed(2)}</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Detailed Time Entries -->
		<div class="card no-print">
			<div class="p-4 border-b flex justify-between items-center">
				<h2 class="font-semibold">Time Entry Details</h2>
				<button on:click={() => showDetail = !showDetail} class="text-sm text-primary-600 hover:text-primary-700">
					{showDetail ? 'Hide Details' : 'Show Details'}
				</button>
			</div>
			{#if showDetail}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clock Out</th>
								<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
								<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Pay</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each data.timeEntriesDetail as entry}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-2">{entry.userName}</td>
									<td class="px-4 py-2">{formatDateTime(entry.clockIn)}</td>
									<td class="px-4 py-2">{entry.clockOut ? formatDateTime(entry.clockOut) : '-'}</td>
									<td class="px-4 py-2 text-right">{entry.hours ? formatHours(entry.hours) : '-'}</td>
									<td class="px-4 py-2 text-right">{entry.pay ? `$${entry.pay.toFixed(2)}` : '-'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

	{:else}
		<!-- Expense Report -->

		<!-- Summary Stats -->
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-gray-900">${data.expenseSummary.totalWithdrawn.toFixed(2)}</p>
				<p class="text-sm text-gray-600">Total Withdrawn</p>
			</div>
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-green-600">${data.expenseSummary.totalAllocated.toFixed(2)}</p>
				<p class="text-sm text-gray-600">Allocated</p>
			</div>
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-yellow-600">${data.expenseSummary.unallocated.toFixed(2)}</p>
				<p class="text-sm text-gray-600">Unallocated</p>
			</div>
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold text-gray-900">{data.expenseSummary.withdrawalCount}</p>
				<p class="text-sm text-gray-600">Withdrawals</p>
			</div>
		</div>

		<!-- Withdrawals Table -->
		<div class="card mb-6">
			<div class="p-4 border-b">
				<h2 class="font-semibold">ATM Withdrawals</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unallocated</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#if data.withdrawals.length === 0}
							<tr>
								<td colspan="7" class="px-4 py-8 text-center text-gray-500">
									No withdrawals for this date range
								</td>
							</tr>
						{:else}
							{#each data.withdrawals as w}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 whitespace-nowrap">{formatDate(w.withdrawnAt)}</td>
									<td class="px-4 py-3">{w.userName}</td>
									<td class="px-4 py-3 text-right font-medium">${w.amount.toFixed(2)}</td>
									<td class="px-4 py-3 text-right text-green-600">${w.allocatedAmount.toFixed(2)}</td>
									<td class="px-4 py-3 text-right {w.unallocatedAmount > 0 ? 'text-yellow-600' : 'text-gray-400'}">
										${w.unallocatedAmount.toFixed(2)}
									</td>
									<td class="px-4 py-3">
										<span class="px-2 py-1 text-xs font-medium rounded-full
											{w.status === 'fully_spent' ? 'bg-green-100 text-green-800' :
											 w.status === 'partially_assigned' ? 'bg-yellow-100 text-yellow-800' :
											 'bg-gray-100 text-gray-800'}">
											{w.status.replace('_', ' ')}
										</span>
									</td>
									<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{w.notes || '-'}</td>
								</tr>
							{/each}
							<tr class="bg-gray-100 font-semibold">
								<td class="px-4 py-3" colspan="2">Total</td>
								<td class="px-4 py-3 text-right">${data.expenseSummary.totalWithdrawn.toFixed(2)}</td>
								<td class="px-4 py-3 text-right text-green-600">${data.expenseSummary.totalAllocated.toFixed(2)}</td>
								<td class="px-4 py-3 text-right text-yellow-600">${data.expenseSummary.unallocated.toFixed(2)}</td>
								<td class="px-4 py-3" colspan="2"></td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Purchase Requests -->
		<div class="card">
			<div class="p-4 border-b flex justify-between items-center">
				<h2 class="font-semibold">Purchase Requests</h2>
				<div class="text-sm text-gray-600">
					<span class="text-green-600">{data.expenseSummary.approvedCount} approved</span> |
					<span class="text-yellow-600">{data.expenseSummary.pendingCount} pending</span> |
					<span class="text-red-600">{data.expenseSummary.deniedCount} denied</span>
				</div>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#if data.purchases.length === 0}
							<tr>
								<td colspan="5" class="px-4 py-8 text-center text-gray-500">
									No purchase requests for this date range
								</td>
							</tr>
						{:else}
							{#each data.purchases as p}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 whitespace-nowrap">{formatDate(p.createdAt)}</td>
									<td class="px-4 py-3">{p.requesterName}</td>
									<td class="px-4 py-3 max-w-xs truncate">{p.description}</td>
									<td class="px-4 py-3 text-right font-medium">${p.proposedPrice.toFixed(2)}</td>
									<td class="px-4 py-3">
										<span class="px-2 py-1 text-xs font-medium rounded-full
											{p.status === 'approved' ? 'bg-green-100 text-green-800' :
											 p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
											 'bg-red-100 text-red-800'}">
											{p.status}
										</span>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
