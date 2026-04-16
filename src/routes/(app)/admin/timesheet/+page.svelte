<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	function selectPeriod(start: string, end: string) {
		goto(`/admin/timesheet?start=${start}&end=${end}`);
	}

	function exportToCSV() {
		const headers = ['Employee', 'Date', 'Clock In', 'Clock Out', 'Break (min)', 'Allowed (min)', 'Excess (min)', 'Hours', 'Auto Clock-Out'];
		const rows: string[][] = [];

		for (const emp of data.employees) {
			for (const day of emp.days) {
				for (const entry of day.entries) {
					rows.push([
						emp.name,
						day.date,
						entry.clockInFormatted,
						entry.clockOutFormatted,
						entry.breakMinutes > 0 ? entry.breakMinutes.toFixed(0) : '',
						entry.allowedBreakMinutes > 0 ? entry.allowedBreakMinutes.toFixed(0) : '',
						entry.excessBreakMinutes > 0 ? entry.excessBreakMinutes.toFixed(0) : '',
						entry.hours.toFixed(2),
						entry.wasForceClockOut ? 'Yes' : ''
					]);
				}
			}
		}

		const csv = [
			headers.join(','),
			...rows.map(row => row.map(cell => `"${cell}"`).join(','))
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `timesheet-${data.startDate}-to-${data.endDate}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function printReport() {
		window.print();
	}
</script>

<svelte:head>
	<title>Payroll Timesheet - TeamTime</title>
	<style>
		@media print {
			.no-print { display: none !important; }
			.print-only { display: block !important; }
			body { background: white; font-size: 11pt; }
			.card { box-shadow: none !important; border: none !important; }

			.employee-section:not(:first-of-type) { page-break-before: always; }
			.employee-section { page-break-inside: avoid; }

			.timesheet-table { width: 100%; border-collapse: collapse; }
			.timesheet-table th,
			.timesheet-table td { border: 1px solid #999; padding: 4px 8px; }

			.signature-line {
				border-bottom: 1px solid #000;
				width: 250px;
				display: inline-block;
				margin-left: 8px;
			}

			@page { margin: 0.5in; }
		}
	</style>
</svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<!-- Header & Controls -->
	<div class="mb-6 no-print">
		<div class="flex items-center gap-2 text-sm text-gray-500 mb-2">
			<a href="/dashboard" class="hover:text-primary-600 transition-colors">Home</a>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
			<span class="text-gray-900">Payroll Timesheet</span>
		</div>
		<div class="flex justify-between items-center">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Payroll Timesheet</h1>
				<p class="text-gray-600">Clock-in/out report for payroll processing</p>
			</div>
			<div class="flex gap-2">
				<button on:click={printReport} class="btn-secondary">
					<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
					</svg>
					Print
				</button>
				<button on:click={exportToCSV} class="btn-primary">
					<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
					</svg>
					CSV
				</button>
			</div>
		</div>
	</div>

	<!-- Pay Period Selector -->
	<div class="card mb-6 no-print">
		<div class="card-body">
			<h3 class="text-sm font-medium text-gray-700 mb-3">Select Pay Period</h3>
			<div class="flex flex-wrap gap-2">
				{#each data.payPeriods as period}
					{@const isSelected = period.startDate === data.startDate && period.endDate === data.endDate}
					<button
						on:click={() => selectPeriod(period.startDate, period.endDate)}
						class="px-3 py-1.5 text-sm rounded-md border transition-colors
							{isSelected
								? 'bg-primary-600 text-white border-primary-600'
								: period.isCurrent
									? 'bg-yellow-50 text-yellow-800 border-yellow-300 hover:bg-yellow-100'
									: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
					>
						{period.label}
						{#if period.isCurrent}
							<span class="text-xs ml-1">(current)</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Summary Bar -->
	<div class="card mb-6 no-print">
		<div class="card-body flex items-center justify-between">
			<div class="text-sm text-gray-600">
				<span class="font-semibold text-gray-900">{data.periodLabel}</span>
				&mdash; {data.grandTotals.employeeCount} employees, {data.grandTotals.totalHours.toFixed(1)} total hours
			</div>
		</div>
	</div>

	<!-- Print Header -->
	<div class="hidden print-only text-center mb-6">
		<h1 class="text-xl font-bold">Payroll Timesheet</h1>
		<p class="text-sm text-gray-600">{data.periodLabel}</p>
	</div>

	<!-- Employee Sections -->
	{#if data.employees.length === 0}
		<div class="card">
			<div class="card-body text-center py-12 text-gray-500">
				No time entries for this pay period.
			</div>
		</div>
	{:else}
		{#each data.employees as emp}
			<div class="employee-section mb-8">
				<!-- Employee Header -->
				<div class="bg-gray-800 text-white px-4 py-3 rounded-t-lg flex justify-between items-center">
					<h2 class="text-lg font-semibold">{emp.name}</h2>
					<span class="text-sm text-gray-300">{data.periodLabel}</span>
				</div>

				<!-- Timesheet Table -->
				<div class="border border-t-0 border-gray-300 rounded-b-lg overflow-hidden">
					<table class="timesheet-table w-full text-sm">
						<thead class="bg-gray-100">
							<tr>
								<th class="px-4 py-2 text-left font-medium text-gray-600 w-28">Date</th>
								<th class="px-4 py-2 text-left font-medium text-gray-600 w-28">Clock In</th>
								<th class="px-4 py-2 text-left font-medium text-gray-600 w-28">Clock Out</th>
								<th class="px-4 py-2 text-right font-medium text-gray-600 w-20">Break</th>
								<th class="px-4 py-2 text-right font-medium text-gray-600 w-20">Hours</th>
							</tr>
						</thead>
						<tbody>
							{#each emp.days as day}
								{#each day.entries as entry, entryIdx}
									<tr class="border-t border-gray-200">
										{#if entryIdx === 0}
											<td class="px-4 py-2 font-medium text-gray-900" rowspan={day.entries.length}>
												{day.dayLabel}
											</td>
										{/if}
										<td class="px-4 py-2 text-gray-700">{entry.clockInFormatted}</td>
										<td class="px-4 py-2 text-gray-700">
											{entry.clockOutFormatted}
											{#if entry.wasForceClockOut}
												<span class="text-red-600 font-medium" title="Auto clock-out by system">*</span>
											{/if}
										</td>
										<td class="px-4 py-2 text-right text-gray-500">
											{#if entry.breakMinutes > 0}
												{Math.floor(entry.breakMinutes / 60)}:{String(Math.round(entry.breakMinutes % 60)).padStart(2, '0')}
												{#if entry.excessBreakMinutes > 0}
													<span class="text-red-600 text-xs font-medium" title="Exceeded allowed break by {entry.excessBreakMinutes.toFixed(0)} min">+{entry.excessBreakMinutes.toFixed(0)}m</span>
												{/if}
											{/if}
										</td>
										<td class="px-4 py-2 text-right text-gray-700">{entry.hours.toFixed(2)}</td>
									</tr>
								{/each}
								{#if day.entries.length > 1}
									<tr class="bg-gray-50 border-t border-gray-200">
										<td colspan="4" class="px-4 py-1 text-right text-xs font-medium text-gray-500 uppercase">
											Daily Total
										</td>
										<td class="px-4 py-1 text-right text-sm font-semibold text-gray-700">
											{day.dailyHours.toFixed(2)}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
						<tfoot>
							<tr class="bg-gray-800 text-white">
								<td colspan="4" class="px-4 py-3 text-right font-semibold">
									Period Total
								</td>
								<td class="px-4 py-3 text-right font-bold text-lg">
									{emp.totalHours.toFixed(2)}
								</td>
							</tr>
						</tfoot>
					</table>

					<!-- Signature Block -->
					<div class="px-4 py-4 bg-white border-t border-gray-200 grid grid-cols-2 gap-6 text-sm">
						<div>
							<p class="text-gray-600 mb-4">
								Employee Signature: <span class="signature-line inline-block border-b border-gray-400 w-48 ml-1">&nbsp;</span>
							</p>
						</div>
						<div>
							<p class="text-gray-600 mb-4">
								Manager Signature: <span class="signature-line inline-block border-b border-gray-400 w-48 ml-1">&nbsp;</span>
							</p>
						</div>
					</div>
				</div>
			</div>
		{/each}

		<!-- Footer Legend -->
		<div class="text-xs text-gray-500 mt-4">
			<span class="text-red-600 font-medium">*</span> = Auto/forced clock-out by system
		</div>
	{/if}
</div>
