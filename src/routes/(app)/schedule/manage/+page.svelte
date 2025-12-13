<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: shifts = data.shifts;
	$: users = data.users;
	$: locations = data.locations;
	$: weekStart = new Date(data.weekStart);

	let showModal = false;
	let selectedDate: Date | null = null;
	let loading = false;

	$: weekDays = (() => {
		const days = [];
		for (let i = 0; i < 7; i++) {
			const day = new Date(weekStart);
			day.setDate(day.getDate() + i);
			days.push(day);
		}
		return days;
	})();

	function getShiftsForDay(date: Date) {
		return shifts.filter(shift => {
			const shiftDate = new Date(shift.startTime);
			return shiftDate.toDateString() === date.toDateString();
		});
	}

	function formatTime(dateStr: string | Date) {
		const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
	}

	function openAddShift(date: Date) {
		selectedDate = date;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		selectedDate = null;
	}

	// Convert a date to Pacific datetime-local string with specific hours
	function toPacificDatetimeLocalWithTime(date: Date, hour: number, minute: number = 0): string {
		// Get the date parts in Pacific timezone
		const options: Intl.DateTimeFormatOptions = {
			timeZone: 'America/Los_Angeles',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		};
		const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
		const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
		return `${get('year')}-${get('month')}-${get('day')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
	}

	function getDefaultStartTime() {
		if (!selectedDate) return '';
		return toPacificDatetimeLocalWithTime(selectedDate, 9, 0);
	}

	function getDefaultEndTime() {
		if (!selectedDate) return '';
		return toPacificDatetimeLocalWithTime(selectedDate, 17, 0);
	}
</script>

<svelte:head>
	<title>Manage Schedule - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-4">
			<a href="/schedule" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">Manage Schedule</h1>
		</div>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
			Shift saved successfully
		</div>
	{/if}

	<!-- Week Navigation -->
	<div class="flex items-center justify-between mb-4">
		<a href="?week={data.weekOffset - 1}" class="btn-ghost">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<h2 class="text-lg font-semibold">
			{weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} -
			{new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
		</h2>
		<a href="?week={data.weekOffset + 1}" class="btn-ghost">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</a>
	</div>

	<!-- Week Grid -->
	<div class="grid grid-cols-7 gap-2">
		{#each weekDays as day}
			{@const dayShifts = getShiftsForDay(day)}
			{@const isToday = day.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) === new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}
			<div class="min-h-[200px]">
				<div class="text-center py-2 font-medium {isToday ? 'bg-primary-100 text-primary-700 rounded-t-lg' : 'bg-gray-100'}">
					<div class="text-xs">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
					<div class="text-lg">{day.getDate()}</div>
				</div>
				<div class="bg-white border border-gray-200 rounded-b-lg p-2 space-y-2 min-h-[150px]">
					{#each dayShifts as shift}
						<div class="bg-primary-50 border-l-4 border-primary-500 p-2 rounded text-xs relative group">
							<div class="font-medium">{shift.userName}</div>
							<div class="text-gray-600">
								{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
							</div>
							{#if shift.locationName}
								<div class="text-gray-500">{shift.locationName}</div>
							{/if}
							<form method="POST" action="?/delete" class="absolute top-1 right-1 hidden group-hover:block">
								<input type="hidden" name="shiftId" value={shift.id} />
								<button type="submit" class="text-red-500 hover:text-red-700 p-1">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</form>
						</div>
					{/each}
					<button
						on:click={() => openAddShift(day)}
						class="w-full py-2 text-xs text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded border-2 border-dashed border-gray-200 hover:border-primary-300"
					>
						+ Add Shift
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Add Shift Modal -->
{#if showModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg max-w-md w-full p-6">
			<h3 class="text-lg font-semibold mb-4">Add Shift</h3>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						closeModal();
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="userId" class="label">Employee *</label>
					<select id="userId" name="userId" required class="input">
						<option value="">Select employee...</option>
						{#each users as user}
							<option value={user.id}>{user.name} ({user.role})</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="locationId" class="label">Location</label>
					<select id="locationId" name="locationId" class="input">
						<option value="">No location</option>
						{#each locations as location}
							<option value={location.id}>{location.name}</option>
						{/each}
					</select>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="startTime" class="label">Start Time *</label>
						<input type="datetime-local" id="startTime" name="startTime" required class="input" value={getDefaultStartTime()} />
					</div>
					<div>
						<label for="endTime" class="label">End Time *</label>
						<input type="datetime-local" id="endTime" name="endTime" required class="input" value={getDefaultEndTime()} />
					</div>
				</div>

				<div>
					<label for="notes" class="label">Notes</label>
					<textarea id="notes" name="notes" rows="2" class="input"></textarea>
				</div>

				<div class="flex gap-4 pt-4">
					<button type="button" on:click={closeModal} class="btn-ghost flex-1">Cancel</button>
					<button type="submit" disabled={loading} class="btn-primary flex-1">
						{loading ? 'Saving...' : 'Add Shift'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
