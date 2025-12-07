<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDateTime(date: Date | string) {
		return new Date(date).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function changeWeek(direction: number) {
		const start = new Date(data.startDate);
		start.setDate(start.getDate() + (direction * 7));
		const end = new Date(start);
		end.setDate(start.getDate() + 7);
		const startStr = start.toISOString().split('T')[0];
		const endStr = end.toISOString().split('T')[0];
		goto('/admin/export-hours?start=' + startStr + '&end=' + endStr);
	}

	function exportToCSV() {
		const headers = ['Employee', 'Email', 'Hourly Rate', 'Clock In', 'Clock Out', 'Hours', 'Pay'];
		const rows = data.entries.map(entry => [
			entry.userName,
			entry.userEmail,
			entry.hourlyRate || '0',
			entry.clockIn ? new Date(entry.clockIn).toISOString() : '',
			entry.clockOut ? new Date(entry.clockOut).toISOString() : '',
			entry.hours.toString(),
			entry.pay.toString()
		]);

		const csv = [
			headers.join(','),
			...rows.map(row => row.map(cell => '"' + cell + '"').join(','))
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'time-export-' + data.startDate + '-' + data.endDate + '.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	function printReport() {
		window.print();
	}

	$: totalHours = data.userSummary.reduce((sum: number, u: any) => sum + u.totalHours, 0);
	$: totalPay = data.userSummary.reduce((sum: number, u: any) => sum + u.totalPay, 0);
</script>

<svelte:head>
	<title>Export Hours - TeamTime</title>
	<style>
		@media print {
			.no-print { display: none !important; }
			.print-only { display: block !important; }
			body { background: white; }
			.card { box-shadow: none; border: 1px solid #ccc; }
		}
	</style>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex justify-between items-center mb-6 no-print">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Export Hours</h1>
			<p class="text-gray-600 mt-1">Export time data for payroll</p>
		</div>
		<div class="flex space-x-2">
			<button on:click={printReport} class="btn-secondary">
				<svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
				</svg>
				Print
			</button>
			<button on:click={exportToCSV} class="btn-primary">
				<svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
				</svg>
				Export CSV
			</button>
		</div>
	</div>

	<!-- Week Navigation -->
	<div class="flex items-center justify-between mb-4 no-print">
		<button on:click={() => changeWeek(-1)} class="btn-secondary">
			Previous Week
		</button>
		<span class="text-lg font-semibold">
			{formatDate(data.startDate)} - {formatDate(data.endDate)}
		</span>
		<button on:click={() => changeWeek(1)} class="btn-secondary">
			Next Week
		</button>
	</div>

	<!-- Print Header -->
	<div class="hidden print-only mb-4">
		<h2 class="text-xl font-bold text-center">
			Time Report: {formatDate(data.startDate)} - {formatDate(data.endDate)}
		</h2>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-primary-600">{data.userSummary.length}</div>
				<div class="text-sm text-gray-600">Employees</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-blue-600">{data.entries.length}</div>
				<div class="text-sm text-gray-600">Time Entries</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-green-600">{totalHours.toFixed(1)}</div>
				<div class="text-sm text-gray-600">Total Hours</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-purple-600">${totalPay.toFixed(2)}</div>
				<div class="text-sm text-gray-600">Total Pay</div>
			</div>
		</div>
	</div>

	<!-- User Summary -->
	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Summary by Employee</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entries</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pay</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each data.userSummary as user}
						<tr>
							<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{user.name}</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${user.hourlyRate || '0'}/hr</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{user.entries}</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{user.totalHours.toFixed(2)}</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${user.totalPay.toFixed(2)}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot class="bg-gray-100">
					<tr>
						<td colspan="4" class="px-4 py-3 text-right font-semibold">Totals:</td>
						<td class="px-4 py-3 font-semibold">{totalHours.toFixed(2)}</td>
						<td class="px-4 py-3 font-semibold">${totalPay.toFixed(2)}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	</div>

	<!-- Detailed Entries -->
	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold">Detailed Time Entries</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock In</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock Out</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pay</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if data.entries.length === 0}
						<tr>
							<td colspan="6" class="px-4 py-8 text-center text-gray-500">
								No time entries for this period
							</td>
						</tr>
					{:else}
						{#each data.entries as entry}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{entry.userName}</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{entry.clockIn ? formatDateTime(entry.clockIn) : '-'}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{entry.clockOut ? formatDateTime(entry.clockOut) : 'Active'}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{entry.hours.toFixed(2)}</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">${entry.pay.toFixed(2)}</td>
								<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{entry.notes || '-'}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
