<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	let editingId: string | null = null;
	let showCreate = false;

	// Editor state
	let editName = '';
	let editDescription = '';
	let editSetAsDefault = false;
	let editShifts: Array<{
		dayOfWeek: number;
		startTime: string;
		endTime: string;
		userId: string;
		locationId: string;
		notes: string;
	}> = [];

	function startCreate() {
		editingId = null;
		showCreate = true;
		editName = '';
		editDescription = '';
		editSetAsDefault = false;
		editShifts = [];
	}

	function startEdit(id: string) {
		const tpl = data.templates.find((t) => t.id === id);
		if (!tpl) return;
		editingId = id;
		showCreate = true;
		editName = tpl.name;
		editDescription = tpl.description ?? '';
		editSetAsDefault = false; // Use set-default action separately
		editShifts = tpl.shifts.map((s) => ({
			dayOfWeek: s.dayOfWeek,
			startTime: s.startTime,
			endTime: s.endTime,
			userId: s.userId,
			locationId: s.locationId ?? '',
			notes: s.notes ?? ''
		}));
	}

	function cancelEdit() {
		showCreate = false;
		editingId = null;
	}

	function addShift() {
		editShifts = [
			...editShifts,
			{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', userId: '', locationId: '', notes: '' }
		];
	}

	function removeShift(i: number) {
		editShifts = editShifts.filter((_, idx) => idx !== i);
	}

	$: shiftsPayload = JSON.stringify(
		editShifts.map((s) => ({
			dayOfWeek: Number(s.dayOfWeek),
			startTime: s.startTime,
			endTime: s.endTime,
			userId: s.userId,
			locationId: s.locationId || null,
			notes: s.notes || null
		}))
	);

	function userName(id: string): string {
		return data.users.find((u) => u.id === id)?.name ?? id.slice(0, 8);
	}

	function locationName(id: string | null): string {
		if (!id) return '—';
		return data.locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
	}

	// Group shifts by day for display
	function shiftsByDay(shifts: typeof data.templates[number]['shifts']) {
		const grouped: Record<number, typeof shifts> = {};
		for (const s of shifts) {
			if (!grouped[s.dayOfWeek]) grouped[s.dayOfWeek] = [];
			grouped[s.dayOfWeek].push(s);
		}
		return grouped;
	}
</script>

<svelte:head>
	<title>Schedule Templates · TeamTime</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-4 pb-20">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold">Schedule Templates</h1>
			<p class="text-sm text-gray-500">
				Reusable weekly patterns. The template marked ★ is auto-applied to future weeks daily.
			</p>
		</div>
		<div class="flex gap-2">
			<a href="/admin/schedule" class="btn-secondary">← Back to Schedule</a>
			<button on:click={startCreate} class="btn-primary">+ New Template</button>
		</div>
	</div>

	{#if form?.success}
		<div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-800">
			{form.message}
		</div>
	{/if}
	{#if form?.error}
		<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800">{form.error}</div>
	{/if}

	{#if showCreate}
		<div class="bg-white border rounded-lg p-4 mb-6">
			<h2 class="text-lg font-semibold mb-3">
				{editingId ? 'Edit Template' : 'New Template'}
			</h2>
			<form
				method="POST"
				action="?/{editingId ? 'update' : 'create'}"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showCreate = false;
						editingId = null;
					};
				}}
			>
				{#if editingId}
					<input type="hidden" name="id" value={editingId} />
				{/if}

				<div class="grid md:grid-cols-2 gap-3 mb-3">
					<label class="block">
						<span class="label">Name *</span>
						<input
							name="name"
							bind:value={editName}
							required
							class="input"
							placeholder="Default Weekly"
						/>
					</label>
					<label class="block">
						<span class="label">Description</span>
						<input
							name="description"
							bind:value={editDescription}
							class="input"
							placeholder="optional"
						/>
					</label>
				</div>

				{#if !editingId}
					<label class="flex items-center gap-2 mb-3">
						<input type="checkbox" name="setAsDefault" bind:checked={editSetAsDefault} />
						<span>Set as active default (used by auto-apply cron)</span>
					</label>
				{/if}

				<div class="mb-3">
					<div class="flex items-center justify-between mb-2">
						<h3 class="font-medium">Shifts ({editShifts.length})</h3>
						<button type="button" on:click={addShift} class="text-sm text-blue-600 hover:underline"
							>+ Add shift row</button
						>
					</div>

					{#if editShifts.length === 0}
						<div class="text-sm text-gray-500 py-4 text-center border border-dashed rounded">
							No shifts yet — click "Add shift row" to build the weekly pattern.
						</div>
					{:else}
						<div class="space-y-1">
							{#each editShifts as shift, i (i)}
								<div class="grid grid-cols-[80px_80px_80px_1fr_1fr_1fr_40px] gap-2 items-center text-sm">
									<select bind:value={shift.dayOfWeek} class="input">
										{#each DAY_NAMES as name, idx}
											<option value={idx}>{name}</option>
										{/each}
									</select>
									<input type="time" bind:value={shift.startTime} class="input" />
									<input type="time" bind:value={shift.endTime} class="input" />
									<select bind:value={shift.userId} class="input" required>
										<option value="">Select user…</option>
										{#each data.users as u}
											<option value={u.id}>{u.name}</option>
										{/each}
									</select>
									<select bind:value={shift.locationId} class="input">
										<option value="">(no location)</option>
										{#each data.locations as l}
											<option value={l.id}>{l.name}</option>
										{/each}
									</select>
									<input
										type="text"
										bind:value={shift.notes}
										class="input"
										placeholder="notes"
									/>
									<button
										type="button"
										on:click={() => removeShift(i)}
										class="text-red-600 hover:underline"
										aria-label="Remove shift">×</button
									>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<input type="hidden" name="shifts" value={shiftsPayload} />

				<div class="flex gap-2 pt-3 border-t">
					<button type="submit" class="btn-primary">{editingId ? 'Save Changes' : 'Create'}</button>
					<button type="button" on:click={cancelEdit} class="btn-secondary">Cancel</button>
				</div>
			</form>
		</div>
	{/if}

	{#if data.templates.length === 0}
		<div class="bg-white border rounded-lg p-8 text-center text-gray-500">
			No templates yet. Create one to enable recurring weekly schedules.
		</div>
	{:else}
		<div class="space-y-3">
			{#each data.templates as tpl}
				<div class="bg-white border rounded-lg p-4">
					<div class="flex flex-wrap items-start justify-between gap-2 mb-2">
						<div>
							<h3 class="text-lg font-semibold">
								{#if tpl.isDefault}<span class="text-yellow-500" title="Active default"
										>★</span
									>{/if}
								{tpl.name}
							</h3>
							{#if tpl.description}
								<p class="text-sm text-gray-500">{tpl.description}</p>
							{/if}
							<p class="text-xs text-gray-400 mt-1">
								{tpl.shifts.length} shifts · {tpl.isActive ? 'active' : 'inactive'}
							</p>
						</div>
						<div class="flex gap-2 flex-wrap">
							<a href="/admin/schedule/templates/{tpl.id}/apply" class="btn-secondary text-sm">
								Apply to range
							</a>
							<button on:click={() => startEdit(tpl.id)} class="btn-secondary text-sm">Edit</button>
							{#if !tpl.isDefault}
								<form method="POST" action="?/setDefault" use:enhance>
									<input type="hidden" name="id" value={tpl.id} />
									<button type="submit" class="btn-secondary text-sm">Make Default</button>
								</form>
								<form
									method="POST"
									action="?/delete"
									use:enhance
									on:submit|preventDefault={(e) => {
										if (confirm(`Delete template "${tpl.name}"? This cannot be undone.`)) {
											e.currentTarget.submit();
										}
									}}
								>
									<input type="hidden" name="id" value={tpl.id} />
									<button type="submit" class="text-red-600 text-sm hover:underline">Delete</button>
								</form>
							{/if}
						</div>
					</div>

					{#if tpl.shifts.length > 0}
						<details class="mt-2">
							<summary class="cursor-pointer text-sm text-gray-600">View shifts</summary>
							<div class="mt-2 grid grid-cols-1 md:grid-cols-7 gap-2 text-sm">
								{#each DAY_NAMES as dayName, dayIdx}
									{@const dayShifts = shiftsByDay(tpl.shifts)[dayIdx] ?? []}
									<div class="border rounded p-2 bg-gray-50">
										<div class="font-medium mb-1">{dayName}</div>
										{#if dayShifts.length === 0}
											<div class="text-xs text-gray-400">—</div>
										{:else}
											{#each dayShifts as s}
												<div class="text-xs mb-1">
													<div class="font-medium">{s.startTime}–{s.endTime}</div>
													<div class="text-gray-600">{userName(s.userId)}</div>
													<div class="text-gray-500">{locationName(s.locationId)}</div>
												</div>
											{/each}
										{/if}
									</div>
								{/each}
							</div>
						</details>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.input {
		@apply w-full px-2 py-1 border border-gray-300 rounded text-sm;
	}
	.label {
		@apply block text-sm font-medium text-gray-700 mb-1;
	}
	.btn-primary {
		@apply px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm;
	}
	.btn-secondary {
		@apply px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-medium text-sm border;
	}
</style>
