<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { notify } from '$lib/notify';
	import type { PageData } from './$types';

	export let data: PageData;

	type Entry = PageData['employees'][number]['days'][number]['entries'][number];

	// Edit / add / delete state. Every write requires a reason; it goes to the
	// audit log and shows in the change log below the timesheet.
	let editing: { entry: Entry; employeeName: string } | null = null;
	let adding = false;
	let confirmingDelete = false;
	let saving = false;
	let editClockIn = '';
	let editClockOut = '';
	let editReason = '';
	let addUserId = '';
	let addClockIn = '';
	let addClockOut = '';
	let addReason = '';
	let deleteForm: HTMLFormElement;

	function openEdit(entry: Entry, employeeName: string) {
		editing = { entry, employeeName };
		editClockIn = entry.clockInLocal;
		editClockOut = entry.clockOutLocal;
		editReason = '';
	}

	function openAdd() {
		adding = true;
		addUserId = '';
		addClockIn = '';
		addClockOut = '';
		addReason = '';
	}

	function closeAll() {
		editing = null;
		adding = false;
		confirmingDelete = false;
	}

	// Shared submit handler: toast on result, refresh the sheet on success.
	function handleResult(successVerb: string) {
		return () => {
			saving = true;
			return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
				saving = false;
				if (result.type === 'success') {
					notify.success(result.data?.message ?? `Entry ${successVerb}`);
					closeAll();
					await invalidateAll();
				} else if (result.type === 'failure') {
					notify.error(result.data?.error ?? `Could not ${successVerb} entry`);
				} else {
					await update();
				}
			};
		};
	}

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
				<button on:click={openAdd} class="btn-secondary">
					<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Add Entry
				</button>
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
								<th class="px-2 py-2 w-10 no-print"><span class="sr-only">Edit</span></th>
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
										<td class="px-4 py-2 text-gray-700">
											{entry.clockInFormatted}
											{#if entry.edited}
												<span class="text-amber-600 font-medium" title="Manually adjusted{entry.editedBy ? ` by ${entry.editedBy}` : ''} — see change log">†</span>
											{/if}
										</td>
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
										<td class="px-2 py-1 text-right no-print">
											<button
												type="button"
												class="btn-ghost btn-sm touch-target"
												title="Edit this entry"
												aria-label="Edit entry for {emp.name} on {day.dayLabel}"
												on:click={() => openEdit(entry, emp.name)}
											>
												<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
												</svg>
											</button>
										</td>
									</tr>
									{#if entry.notes}
										<!-- System notes explain an auto clock-out and, for justified
										     overtime, ask the approver to confirm the real finish time.
										     They belong on the page where hours get approved. -->
										<tr class="border-t-0">
											<td></td>
											<td
												colspan="4"
												class="px-4 pb-2 text-xs whitespace-pre-wrap break-words {entry.notes.includes('Confirm the real finish time')
													? 'text-amber-700'
													: 'text-gray-500'}"
											>
												{entry.notes}
											</td>
											<td class="no-print"></td>
										</tr>
									{/if}
								{/each}
								{#if day.entries.length > 1}
									<tr class="bg-gray-50 border-t border-gray-200">
										<td colspan="4" class="px-4 py-1 text-right text-xs font-medium text-gray-500 uppercase">
											Daily Total
										</td>
										<td class="px-4 py-1 text-right text-sm font-semibold text-gray-700">
											{day.dailyHours.toFixed(2)}
										</td>
										<td class="no-print"></td>
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
								<td class="no-print bg-gray-800"></td>
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
			&nbsp;&nbsp;
			<span class="text-amber-600 font-medium">†</span> = Manually adjusted (see change log)
		</div>
	{/if}

	<!-- Change Log: every manual adjustment that touches this pay period -->
	<div class="card mt-8 change-log">
		<div class="card-header">
			<h2 class="text-lg font-semibold text-gray-900">Change Log</h2>
			<p class="text-sm text-gray-500">Manual adjustments to time entries and shifts in {data.periodLabel}</p>
		</div>
		<div class="card-body p-0">
			{#if data.changes.length === 0}
				<p class="px-4 py-6 text-sm text-gray-500 text-center">No manual adjustments for this pay period.</p>
			{:else}
				<ul class="divide-y divide-gray-200">
					{#each data.changes as c (c.id)}
						<li class="px-4 py-3 text-sm">
							<div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
								<span class="font-medium text-gray-900">{c.what} — {c.employee}</span>
								<span class="text-gray-500">{c.when} by {c.by}</span>
							</div>
							<div class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-gray-700">
								{#if c.before}
									<span class="text-gray-400">from</span><span class="font-mono text-xs sm:text-sm">{c.before}</span>
								{/if}
								{#if c.after}
									<span class="text-gray-400">to</span><span class="font-mono text-xs sm:text-sm">{c.after}</span>
								{/if}
								{#if c.reason}
									<span class="text-gray-400">why</span><span class="whitespace-pre-wrap break-words">{c.reason}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<!-- Edit entry -->
<Modal open={editing !== null} title="Edit time entry" on:close={closeAll}>
	{#if editing}
		<form method="POST" action="?/updateEntry" use:enhance={handleResult('updated')} class="space-y-4">
			<input type="hidden" name="entryId" value={editing.entry.id} />
			<p class="text-sm text-gray-700">
				<span class="font-medium">{editing.employeeName}</span>
				{#if editing.entry.edited}
					<span class="badge-warning ml-2">previously adjusted</span>
				{/if}
			</p>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label class="label" for="edit-clock-in">Clock in</label>
					<input id="edit-clock-in" name="clockIn" type="datetime-local" class="input" required bind:value={editClockIn} />
				</div>
				<div>
					<label class="label" for="edit-clock-out">Clock out</label>
					<input id="edit-clock-out" name="clockOut" type="datetime-local" class="input" bind:value={editClockOut} />
					<p class="text-xs text-gray-500 mt-1">Leave blank only if the employee is still clocked in.</p>
				</div>
			</div>
			<div>
				<label class="label" for="edit-reason">Reason for change <span class="text-red-600">*</span></label>
				<input id="edit-reason" name="reason" class="input" required minlength="3" maxlength="500" placeholder="e.g. Forgot to clock out, left at 5:30" bind:value={editReason} />
				<p class="text-xs text-gray-500 mt-1">Recorded in the change log with your name.</p>
			</div>
			<div class="flex flex-wrap justify-between gap-2 pt-2">
				<button type="button" class="btn-danger" on:click={() => (confirmingDelete = true)} disabled={saving || !editing.entry.clockOut}>Delete entry</button>
				<div class="flex gap-2">
					<button type="button" class="btn-secondary" on:click={closeAll} disabled={saving}>Cancel</button>
					<button type="submit" class="btn-primary" disabled={saving || editReason.trim().length < 3}>Save</button>
				</div>
			</div>
		</form>
		<form method="POST" action="?/deleteEntry" use:enhance={handleResult('deleted')} bind:this={deleteForm} class="hidden">
			<input type="hidden" name="entryId" value={editing.entry.id} />
			<input type="hidden" name="reason" value={editReason} />
		</form>
	{/if}
</Modal>

<ConfirmDialog
	open={confirmingDelete}
	title="Delete this time entry?"
	message={editReason.trim().length < 3
		? 'Enter a reason in the edit form first — it is required for deletions too.'
		: `This removes ${editing?.employeeName ?? 'the employee'}'s entry from payroll. The deletion and your reason are kept in the change log.`}
	confirmLabel="Delete"
	loading={saving}
	on:cancel={() => (confirmingDelete = false)}
	on:confirm={() => {
		if (editReason.trim().length < 3) { notify.error('A reason is required'); return; }
		deleteForm.requestSubmit();
	}}
/>

<!-- Add entry -->
<Modal open={adding} title="Add time entry" on:close={closeAll}>
	<form method="POST" action="?/createEntry" use:enhance={handleResult('added')} class="space-y-4">
		<div>
			<label class="label" for="add-user">Employee</label>
			<select id="add-user" name="userId" class="input" required bind:value={addUserId}>
				<option value="" disabled>Select employee…</option>
				{#each data.staff as s}
					<option value={s.id}>{s.name}</option>
				{/each}
			</select>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label class="label" for="add-clock-in">Clock in</label>
				<input id="add-clock-in" name="clockIn" type="datetime-local" class="input" required bind:value={addClockIn} />
			</div>
			<div>
				<label class="label" for="add-clock-out">Clock out</label>
				<input id="add-clock-out" name="clockOut" type="datetime-local" class="input" required bind:value={addClockOut} />
			</div>
		</div>
		<div>
			<label class="label" for="add-reason">Reason <span class="text-red-600">*</span></label>
			<input id="add-reason" name="reason" class="input" required minlength="3" maxlength="500" placeholder="e.g. Covered Sat shift, kiosk was down" bind:value={addReason} />
		</div>
		<div class="flex justify-end gap-2 pt-2">
			<button type="button" class="btn-secondary" on:click={closeAll} disabled={saving}>Cancel</button>
			<button type="submit" class="btn-primary" disabled={saving || !addUserId || addReason.trim().length < 3}>Add entry</button>
		</div>
	</form>
</Modal>
