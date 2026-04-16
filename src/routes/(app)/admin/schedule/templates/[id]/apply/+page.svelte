<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let startDate = '';
	let endDate = '';

	// Per-slot decisions — keyed by slotKey
	let decisions: Record<string, 'skip' | 'overwrite' | 'add_alongside'> = {};

	function userName(id: string): string {
		return data.users.find((u) => u.id === id)?.name ?? id.slice(0, 8);
	}
	function locationName(id: string | null): string {
		if (!id) return '—';
		return data.locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
	}

	// Initialize decisions whenever a plan comes back
	$: if (form && 'plan' in form && form.plan) {
		const next: typeof decisions = {};
		for (const c of form.plan.conflicts) {
			next[c.slot.slotKey] = decisions[c.slot.slotKey] ?? 'skip';
		}
		decisions = next;
	}

	$: decisionsPayload = JSON.stringify(decisions);

	function formatShiftTime(date: string) {
		return new Date(date).toLocaleString('en-US', {
			timeZone: 'America/Los_Angeles',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Apply Template · {data.template.name}</title>
</svelte:head>

<div class="max-w-5xl mx-auto p-4 pb-20">
	<div class="mb-4">
		<a href="/admin/schedule/templates" class="text-sm text-blue-600 hover:underline"
			>← Back to templates</a
		>
		<h1 class="text-2xl font-bold mt-2">Apply Template: {data.template.name}</h1>
		<p class="text-sm text-gray-500">
			{data.template.shifts.length} shifts · Choose a date range then review conflicts.
		</p>
	</div>

	{#if form?.error}
		<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800">{form.error}</div>
	{/if}

	{#if form && 'committed' in form && form.committed}
		<div class="mb-4 p-4 bg-green-50 border border-green-200 rounded">
			<h2 class="font-semibold text-green-800">Applied Successfully</h2>
			<p class="text-sm text-green-700 mt-1">
				Created: {form.result.created} · Deleted: {form.result.deleted} · Skipped: {form.result
					.skipped}
			</p>
			<a href="/admin/schedule" class="text-sm text-blue-600 hover:underline mt-2 inline-block"
				>View schedule →</a
			>
		</div>
	{/if}

	<form method="POST" action="?/plan" use:enhance class="bg-white border rounded-lg p-4 mb-4">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
			<label class="block">
				<span class="label">Start date</span>
				<input type="date" name="startDate" bind:value={startDate} required class="input" />
			</label>
			<label class="block">
				<span class="label">End date</span>
				<input type="date" name="endDate" bind:value={endDate} required class="input" />
			</label>
			<button type="submit" class="btn-primary">Preview Plan</button>
		</div>
	</form>

	{#if form && 'plan' in form && form.plan}
		{@const plan = form.plan}
		<div class="bg-white border rounded-lg p-4 mb-4">
			<h2 class="text-lg font-semibold mb-3">Plan Summary</h2>
			<div class="grid grid-cols-3 gap-3 mb-4">
				<div class="p-3 bg-green-50 border border-green-200 rounded">
					<div class="text-2xl font-bold text-green-800">{plan.summary.createCount}</div>
					<div class="text-sm text-green-700">Clean inserts</div>
				</div>
				<div class="p-3 bg-yellow-50 border border-yellow-200 rounded">
					<div class="text-2xl font-bold text-yellow-800">{plan.summary.conflictCount}</div>
					<div class="text-sm text-yellow-700">Conflicts (need decisions)</div>
				</div>
				<div class="p-3 bg-gray-50 border border-gray-200 rounded">
					<div class="text-2xl font-bold text-gray-800">{plan.summary.matchingCount}</div>
					<div class="text-sm text-gray-700">Already matching</div>
				</div>
			</div>

			{#if plan.toCreate.length > 0}
				<details class="mb-4">
					<summary class="cursor-pointer font-medium text-green-700 mb-2">
						Will create {plan.toCreate.length} shifts
					</summary>
					<div class="mt-2 max-h-64 overflow-y-auto text-sm border rounded">
						<table class="w-full text-left">
							<thead class="bg-gray-50 text-xs uppercase text-gray-600">
								<tr>
									<th class="p-2">Date</th>
									<th class="p-2">Time</th>
									<th class="p-2">User</th>
									<th class="p-2">Location</th>
								</tr>
							</thead>
							<tbody>
								{#each plan.toCreate as slot}
									<tr class="border-t">
										<td class="p-2">{slot.date}</td>
										<td class="p-2">{slot.startTime}–{slot.endTime}</td>
										<td class="p-2">{userName(slot.userId)}</td>
										<td class="p-2">{locationName(slot.locationId)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{/if}

			{#if plan.conflicts.length > 0}
				<div class="mb-4">
					<h3 class="font-medium text-yellow-800 mb-2">
						Conflicts — choose a decision for each:
					</h3>
					<div class="space-y-2">
						{#each plan.conflicts as c}
							<div class="border border-yellow-300 bg-yellow-50 p-3 rounded">
								<div class="text-sm font-medium">
									{userName(c.slot.userId)} — {c.slot.date} {c.slot.startTime}–{c.slot.endTime}
								</div>
								<div class="text-xs text-gray-600 mb-2">
									Existing: {c.existing
										.map(
											(e) =>
												`${formatShiftTime(e.startTime.toString())}–${formatShiftTime(
													e.endTime.toString()
												)}`
										)
										.join(', ')}
								</div>
								<div class="flex flex-wrap gap-3 text-sm">
									<label class="flex items-center gap-1">
										<input
											type="radio"
											bind:group={decisions[c.slot.slotKey]}
											value="skip"
										/>
										<span>Skip (keep existing)</span>
									</label>
									<label class="flex items-center gap-1">
										<input
											type="radio"
											bind:group={decisions[c.slot.slotKey]}
											value="overwrite"
										/>
										<span class="text-red-700">Overwrite with template</span>
									</label>
									<label class="flex items-center gap-1">
										<input
											type="radio"
											bind:group={decisions[c.slot.slotKey]}
											value="add_alongside"
										/>
										<span>Add alongside existing</span>
									</label>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<form
				method="POST"
				action="?/commit"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
					};
				}}
			>
				<input type="hidden" name="startDate" value={plan.startDate} />
				<input type="hidden" name="endDate" value={plan.endDate} />
				<input type="hidden" name="decisions" value={decisionsPayload} />
				<button type="submit" class="btn-primary">
					Apply — {plan.summary.createCount} create +
					{Object.values(decisions).filter((d) => d !== 'skip').length} resolved
				</button>
			</form>
		</div>
	{/if}
</div>

<style>
	.input {
		@apply w-full px-2 py-1.5 border border-gray-300 rounded text-sm;
	}
	.label {
		@apply block text-sm font-medium text-gray-700 mb-1;
	}
	.btn-primary {
		@apply px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm;
	}
</style>
