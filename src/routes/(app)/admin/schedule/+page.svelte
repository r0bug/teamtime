<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let loading = false;

	function formatTime(date: Date | string) {
		return new Date(date).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function printSchedule() {
		window.print();
	}

	function changeWeek(direction: number) {
		const start = new Date(data.startDate);
		start.setDate(start.getDate() + (direction * 7));
		const end = new Date(start);
		end.setDate(start.getDate() + 7);
		const startStr = start.toISOString().split('T')[0];
		const endStr = end.toISOString().split('T')[0];
		goto('/admin/schedule?start=' + startStr + '&end=' + endStr);
	}
</script>

<svelte:head>
	<title>Schedule Admin - TeamTime</title>
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
			<h1 class="text-2xl font-bold text-gray-900">Schedule Management</h1>
			<p class="text-gray-600 mt-1">Create and manage employee schedules</p>
		</div>
		<div class="flex space-x-2">
			<button on:click={printSchedule} class="btn-secondary">
				<svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
				</svg>
				Print
			</button>
			<button on:click={() => showCreateModal = true} class="btn-primary">
				+ Add Shift
			</button>
		</div>
	</div>

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4 no-print">
			{form.message}
		</div>
	{/if}

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 no-print">
			{form.error}
		</div>
	{/if}

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
			Schedule: {formatDate(data.startDate)} - {formatDate(data.endDate)}
		</h2>
	</div>

	<!-- Schedule Table -->
	<div class="card">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider no-print">Actions</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if data.shifts.length === 0}
						<tr>
							<td colspan="6" class="px-4 py-8 text-center text-gray-500">
								No shifts scheduled for this week
							</td>
						</tr>
					{:else}
						{#each data.shifts as shift}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
									{shift.userName}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{formatDate(shift.startTime)}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{shift.locationName || '-'}
								</td>
								<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
									{shift.notes || '-'}
								</td>
								<td class="px-4 py-3 whitespace-nowrap no-print">
									<form method="POST" action="?/deleteShift" use:enhance class="inline">
										<input type="hidden" name="shiftId" value={shift.id} />
										<button type="submit" class="text-red-600 hover:text-red-700 text-sm">
											Delete
										</button>
									</form>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Create Shift Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 no-print">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Create Shift</h2>
				<form method="POST" action="?/createShift" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showCreateModal = false;
						await update();
					};
				}} class="space-y-4">
					<div>
						<label for="userId" class="label">Employee</label>
						<select id="userId" name="userId" required class="input">
							<option value="">Select employee...</option>
							{#each data.users as user}
								<option value={user.id}>{user.name} ({user.role})</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="locationId" class="label">Location (optional)</label>
						<select id="locationId" name="locationId" class="input">
							<option value="">No location</option>
							{#each data.locations as location}
								<option value={location.id}>{location.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="startTime" class="label">Start Time</label>
						<input type="datetime-local" id="startTime" name="startTime" required class="input" />
					</div>
					<div>
						<label for="endTime" class="label">End Time</label>
						<input type="datetime-local" id="endTime" name="endTime" required class="input" />
					</div>
					<div>
						<label for="notes" class="label">Notes (optional)</label>
						<textarea id="notes" name="notes" rows="2" class="input"></textarea>
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={() => showCreateModal = false} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Creating...' : 'Create Shift'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
