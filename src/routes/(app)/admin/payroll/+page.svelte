<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { notify } from '$lib/notify';
	import type { PageData } from './$types';

	export let data: PageData;

	$: rows = data.rows;
	$: earning = data.earningTypes;

	function selectPeriod(e: Event) {
		const v = (e.target as HTMLSelectElement).value;
		const [start, end] = v.split('|');
		goto(`/admin/payroll?start=${start}&end=${end}`);
	}

	function csvCell(v: string | number | null): string {
		const s = v == null ? '' : String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	}

	function downloadCsv() {
		if (!data.selected) return;
		const header = ['Employee', 'NRS Employee #', 'Regular Hours', 'Overtime Hours', 'Total Hours'];
		const lines = [header.map(csvCell).join(',')];
		for (const r of rows) {
			lines.push(
				[r.name, r.nrsNumber ?? '(unmapped)', r.regularHours.toFixed(2), r.overtimeHours.toFixed(2), r.totalHours.toFixed(2)]
					.map(csvCell)
					.join(',')
			);
		}
		const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `payroll_${data.selected.start}_${data.selected.end}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head><title>Payroll Export - TeamTime</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<div class="mb-4">
		<a href="/admin" class="text-primary-600 text-sm hover:underline">&larr; Admin</a>
		<h1 class="text-2xl font-bold mt-1">Payroll Export</h1>
		<p class="text-gray-600 text-sm mt-1">
			Worked hours for NRS payroll, from TeamTime's time clock. Regular and overtime (over 40 h/week) are
			split for you; enter Holiday, PTO and Sick lines in NRS from your leave records.
		</p>
	</div>

	{#if data.unsupportedConfig}
		<div class="card"><div class="card-body">
			<p class="text-gray-700">
				The current pay-period type has no automatic periods. Set a semi-monthly, weekly or monthly schedule in
				<a href="/admin/pay-periods" class="text-primary-600 hover:underline">Pay Periods</a> to use this export.
			</p>
		</div></div>
	{:else}
		<div class="card mb-4">
			<div class="card-body flex flex-wrap items-end gap-4">
				<label class="text-sm text-gray-600">
					<span class="block mb-1">Pay period</span>
					<select class="input !w-auto" on:change={selectPeriod} value={`${data.selected?.start}|${data.selected?.end}`}>
						{#each data.periods as p}
							<option value={`${p.start}|${p.end}`}>{p.label}{p.isCurrent ? ' (current — in progress)' : ''}</option>
						{/each}
					</select>
				</label>
				<div class="text-sm text-gray-600">
					<span class="block mb-1">Totals</span>
					<span class="font-semibold text-gray-900">{data.totals?.regular ?? 0}h</span> regular ·
					<span class="font-semibold text-gray-900">{data.totals?.overtime ?? 0}h</span> OT
				</div>
				<div class="ml-auto">
					<button class="btn-primary btn-sm" on:click={downloadCsv} disabled={rows.length === 0}>Download CSV</button>
				</div>
			</div>
		</div>

		{#if data.selected?.isCurrent}
			<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
				This pay period is still in progress — hours will keep changing until it closes.
			</div>
		{/if}
		{#if data.nrsError}
			<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
				Couldn't reach NRS to load the employee roster ({data.nrsError}). Hours are still correct; NRS employee
				numbers and mapping suggestions are unavailable right now.
			</div>
		{/if}
		{#if data.totals && data.totals.unmapped > 0}
			<div class="mb-4 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-800">
				{data.totals.unmapped} staff member{data.totals.unmapped === 1 ? ' is' : 's are'} not yet linked to an NRS
				employee. Map them below so their hours land on the right NRS check.
			</div>
		{/if}

		<div class="card">
			<div class="card-body overflow-x-auto">
				{#if rows.length === 0}
					<p class="text-gray-500 text-center py-6">No worked hours in this pay period.</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="text-left text-gray-500 border-b border-gray-200">
								<th class="py-2 pr-3">Employee</th>
								<th class="py-2 px-3">NRS Employee</th>
								<th class="py-2 px-3 text-right">Regular ({earning.regular.code})</th>
								<th class="py-2 px-3 text-right">Overtime ({earning.overtime.code})</th>
								<th class="py-2 pl-3 text-right">Total</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as r (r.userId)}
								<tr class="border-b border-gray-100">
									<td class="py-2 pr-3 font-medium">
										{r.name}
										{#if r.hasSplitWeek}
											<span class="text-amber-600" title="A workweek straddles the period boundary — verify overtime for this employee.">⚠</span>
										{/if}
									</td>
									<td class="py-2 px-3">
										{#if r.nrsEmployeeId != null}
											<span class="text-gray-700">#{r.nrsNumber ?? r.nrsEmployeeId}</span>
											{#if r.nrsName}<span class="text-gray-400"> · {r.nrsName}</span>{/if}
											<form method="POST" action="?/map" use:enhance={() => async ({ result }) => {
												if (result.type === 'success') { await invalidateAll(); notify.success('Unlinked'); }
											}} class="inline">
												<input type="hidden" name="userId" value={r.userId} />
												<input type="hidden" name="nrsEmployeeId" value="" />
												<button class="text-gray-400 hover:text-red-600 text-xs ml-1" title="Unlink">✕</button>
											</form>
										{:else}
											<form method="POST" action="?/map" use:enhance={() => async ({ result }) => {
												if (result.type === 'success') { await invalidateAll(); notify.success('Mapped to NRS employee'); }
												else if (result.type === 'failure') notify.error(String(result.data?.error ?? 'Map failed'));
											}} class="flex items-center gap-1">
												<input type="hidden" name="userId" value={r.userId} />
												<select name="nrsEmployeeId" class="input !w-auto !py-1 text-xs">
													<option value="">— pick NRS employee —</option>
													{#each data.employees as e}
														<option value={e.employeeId} selected={r.suggestion?.employeeId === e.employeeId}>
															{e.displayName}{e.number ? ` (#${e.number})` : ''}
														</option>
													{/each}
												</select>
												<button class="btn-secondary btn-sm !py-1 text-xs">Link</button>
												{#if r.suggestion}<span class="text-blue-600 text-xs">suggested: {r.suggestion.displayName}</span>{/if}
											</form>
										{/if}
									</td>
									<td class="py-2 px-3 text-right tabular-nums">{r.regularHours.toFixed(2)}</td>
									<td class="py-2 px-3 text-right tabular-nums {r.overtimeHours > 0 ? 'text-amber-700 font-medium' : ''}">{r.overtimeHours.toFixed(2)}</td>
									<td class="py-2 pl-3 text-right tabular-nums font-medium">{r.totalHours.toFixed(2)}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t-2 border-gray-300 font-semibold">
								<td class="py-2 pr-3" colspan="2">Totals</td>
								<td class="py-2 px-3 text-right tabular-nums">{(data.totals?.regular ?? 0).toFixed(2)}</td>
								<td class="py-2 px-3 text-right tabular-nums">{(data.totals?.overtime ?? 0).toFixed(2)}</td>
								<td class="py-2 pl-3 text-right tabular-nums">{((data.totals?.regular ?? 0) + (data.totals?.overtime ?? 0)).toFixed(2)}</td>
							</tr>
						</tfoot>
					</table>
				{/if}
			</div>
		</div>

		<div class="mt-4 text-xs text-gray-500">
			<p><strong>How to use:</strong> in NRS, open Payroll → Enter/Edit Checks for this pay period, and for each
			employee enter a Regular ({earning.regular.code}) line and, where shown, an Overtime ({earning.overtime.code})
			line with the hours above. NRS fills in pay rate, taxes and deductions. Add Holiday ({earning.holiday.code}),
			PTO ({earning.pto.code}) and Sick ({earning.sick.code}) lines from your leave records.</p>
			<p class="mt-1">⚠ marks an employee whose workweek crosses this period's start; overtime for that week is
			computed from hours inside the period only — double-check it against the adjacent period.</p>
		</div>
	{/if}
</div>
