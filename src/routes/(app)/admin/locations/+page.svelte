<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let editingLocation: typeof data.locations[0] | null = null;
	let editingHoursLocation: typeof data.locations[0] | null = null;
	let loading = false;

	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	// Get store hours for a location
	function getLocationHours(locationId: string) {
		const hours: { [key: number]: { openTime: string | null; closeTime: string | null; isClosed: boolean } } = {};
		for (let i = 0; i < 7; i++) {
			const found = data.storeHours.find(h => h.locationId === locationId && h.dayOfWeek === i);
			hours[i] = found
				? { openTime: found.openTime, closeTime: found.closeTime, isClosed: found.isClosed }
				: { openTime: '09:00', closeTime: '17:00', isClosed: false };
		}
		return hours;
	}

	// Format hours display
	function formatHoursDisplay(locationId: string) {
		const hours = getLocationHours(locationId);
		const openDays = Object.entries(hours)
			.filter(([_, h]) => !h.isClosed && h.openTime && h.closeTime)
			.map(([day, h]) => `${dayShort[Number(day)]}: ${h.openTime}-${h.closeTime}`);

		if (openDays.length === 0) return 'No hours set';
		if (openDays.length > 3) return `${openDays.slice(0, 3).join(', ')}...`;
		return openDays.join(', ');
	}

	// Individual day states for proper reactivity
	let day0: { openTime: string; closeTime: string; isClosed: boolean } = { openTime: '09:00', closeTime: '17:00', isClosed: false };
	let day1: { openTime: string; closeTime: string; isClosed: boolean } = { openTime: '09:00', closeTime: '17:00', isClosed: false };
	let day2: { openTime: string; closeTime: string; isClosed: boolean } = { openTime: '09:00', closeTime: '17:00', isClosed: false };
	let day3: { openTime: string; closeTime: string; isClosed: boolean } = { openTime: '09:00', closeTime: '17:00', isClosed: false };
	let day4: { openTime: string; closeTime: string; isClosed: boolean } = { openTime: '09:00', closeTime: '17:00', isClosed: false };
	let day5: { openTime: string; closeTime: string; isClosed: boolean } = { openTime: '09:00', closeTime: '17:00', isClosed: false };
	let day6: { openTime: string; closeTime: string; isClosed: boolean } = { openTime: '09:00', closeTime: '17:00', isClosed: false };

	$: dayStates = [day0, day1, day2, day3, day4, day5, day6];

	// Initialize day states when modal opens
	function initEditHours(locationId: string) {
		const hours = getLocationHours(locationId);
		day0 = { openTime: hours[0].openTime || '09:00', closeTime: hours[0].closeTime || '17:00', isClosed: hours[0].isClosed };
		day1 = { openTime: hours[1].openTime || '09:00', closeTime: hours[1].closeTime || '17:00', isClosed: hours[1].isClosed };
		day2 = { openTime: hours[2].openTime || '09:00', closeTime: hours[2].closeTime || '17:00', isClosed: hours[2].isClosed };
		day3 = { openTime: hours[3].openTime || '09:00', closeTime: hours[3].closeTime || '17:00', isClosed: hours[3].isClosed };
		day4 = { openTime: hours[4].openTime || '09:00', closeTime: hours[4].closeTime || '17:00', isClosed: hours[4].isClosed };
		day5 = { openTime: hours[5].openTime || '09:00', closeTime: hours[5].closeTime || '17:00', isClosed: hours[5].isClosed };
		day6 = { openTime: hours[6].openTime || '09:00', closeTime: hours[6].closeTime || '17:00', isClosed: hours[6].isClosed };
	}

	function setQuickHours(preset: 'weekdays' | 'all' | 'clear') {
		if (preset === 'weekdays') {
			day0 = { openTime: '', closeTime: '', isClosed: true };
			day1 = { openTime: '09:00', closeTime: '17:00', isClosed: false };
			day2 = { openTime: '09:00', closeTime: '17:00', isClosed: false };
			day3 = { openTime: '09:00', closeTime: '17:00', isClosed: false };
			day4 = { openTime: '09:00', closeTime: '17:00', isClosed: false };
			day5 = { openTime: '09:00', closeTime: '17:00', isClosed: false };
			day6 = { openTime: '', closeTime: '', isClosed: true };
		} else if (preset === 'all') {
			day0 = { openTime: '10:00', closeTime: '18:00', isClosed: false };
			day1 = { openTime: '10:00', closeTime: '18:00', isClosed: false };
			day2 = { openTime: '10:00', closeTime: '18:00', isClosed: false };
			day3 = { openTime: '10:00', closeTime: '18:00', isClosed: false };
			day4 = { openTime: '10:00', closeTime: '18:00', isClosed: false };
			day5 = { openTime: '10:00', closeTime: '18:00', isClosed: false };
			day6 = { openTime: '10:00', closeTime: '18:00', isClosed: false };
		} else {
			day0 = { openTime: '', closeTime: '', isClosed: true };
			day1 = { openTime: '', closeTime: '', isClosed: true };
			day2 = { openTime: '', closeTime: '', isClosed: true };
			day3 = { openTime: '', closeTime: '', isClosed: true };
			day4 = { openTime: '', closeTime: '', isClosed: true };
			day5 = { openTime: '', closeTime: '', isClosed: true };
			day6 = { openTime: '', closeTime: '', isClosed: true };
		}
	}
</script>

<svelte:head>
	<title>Locations - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div class="flex justify-between items-center mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Locations</h1>
			<p class="text-gray-600 mt-1">Manage work locations and store hours</p>
		</div>
		<button on:click={() => showCreateModal = true} class="btn-primary">
			+ Add Location
		</button>
	</div>

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.message}
		</div>
	{/if}

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.error}
		</div>
	{/if}

	<div class="card">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Store Hours</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if data.locations.length === 0}
						<tr>
							<td colspan="5" class="px-4 py-8 text-center text-gray-500">
								No locations yet. Add your first location to get started.
							</td>
						</tr>
					{:else}
						{#each data.locations as location}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{location.name}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{location.address || '-'}</td>
								<td class="px-4 py-3 text-sm text-gray-600">
									<div class="max-w-xs truncate" title={formatHoursDisplay(location.id)}>
										{formatHoursDisplay(location.id)}
									</div>
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
									<span class="px-2 py-1 text-xs font-medium rounded-full {location.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
										{location.isActive ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
									<button
										on:click={() => {
											editingHoursLocation = { ...location };
											initEditHours(location.id);
										}}
										class="text-blue-600 hover:text-blue-700 text-sm font-medium mr-3"
									>
										Hours
									</button>
									<button
										on:click={() => editingLocation = { ...location }}
										class="text-primary-600 hover:text-primary-700 text-sm font-medium mr-3"
									>
										Edit
									</button>
									<form method="POST" action="?/delete" use:enhance class="inline">
										<input type="hidden" name="locationId" value={location.id} />
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

<!-- Create Location Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Add Location</h2>
				<form method="POST" action="?/create" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showCreateModal = false;
						await update();
					};
				}} class="space-y-4">
					<div>
						<label for="name" class="label">Name</label>
						<input type="text" id="name" name="name" required class="input" />
					</div>
					<div>
						<label for="address" class="label">Address (optional)</label>
						<textarea id="address" name="address" rows="2" class="input"></textarea>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="lat" class="label">Latitude (optional)</label>
							<input type="text" id="lat" name="lat" class="input" placeholder="46.6021" />
						</div>
						<div>
							<label for="lng" class="label">Longitude (optional)</label>
							<input type="text" id="lng" name="lng" class="input" placeholder="-120.5059" />
						</div>
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={() => showCreateModal = false} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Creating...' : 'Create Location'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Location Modal -->
{#if editingLocation}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Edit Location</h2>
				<form method="POST" action="?/update" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						editingLocation = null;
						await update();
					};
				}} class="space-y-4">
					<input type="hidden" name="locationId" value={editingLocation.id} />
					<div>
						<label for="edit-name" class="label">Name</label>
						<input type="text" id="edit-name" name="name" bind:value={editingLocation.name} required class="input" />
					</div>
					<div>
						<label for="edit-address" class="label">Address (optional)</label>
						<textarea id="edit-address" name="address" bind:value={editingLocation.address} rows="2" class="input"></textarea>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="edit-lat" class="label">Latitude</label>
							<input type="text" id="edit-lat" name="lat" bind:value={editingLocation.lat} class="input" />
						</div>
						<div>
							<label for="edit-lng" class="label">Longitude</label>
							<input type="text" id="edit-lng" name="lng" bind:value={editingLocation.lng} class="input" />
						</div>
					</div>
					<div>
						<label class="flex items-center">
							<input type="checkbox" name="isActive" value="true" checked={editingLocation.isActive} class="mr-2" />
							<span>Active</span>
						</label>
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={() => editingLocation = null} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Saving...' : 'Save Changes'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Store Hours Modal -->
{#if editingHoursLocation}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
			<div class="p-6 pb-3 border-b">
				<h2 class="text-xl font-bold">Store Hours</h2>
				<p class="text-gray-600 text-sm">{editingHoursLocation.name}</p>
			</div>

			<form method="POST" action="?/updateStoreHours" use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					editingHoursLocation = null;
					await update();
				};
			}} class="flex flex-col flex-1 overflow-hidden">
				<input type="hidden" name="locationId" value={editingHoursLocation.id} />

				<div class="flex-1 overflow-y-auto p-6 pt-4 space-y-3">
					<!-- Sunday -->
					<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
						<div class="w-20 font-medium text-sm">Sunday</div>
						<label class="flex items-center cursor-pointer">
							<input type="checkbox" name="day_0_closed" value="true" bind:checked={day0.isClosed} class="mr-2 cursor-pointer" />
							<span class="text-sm text-gray-600">Closed</span>
						</label>
						{#if !day0.isClosed}
							<div class="flex items-center gap-2 ml-auto">
								<input type="time" name="day_0_open" bind:value={day0.openTime} class="input py-1 px-2 text-sm w-28" />
								<span class="text-gray-400">to</span>
								<input type="time" name="day_0_close" bind:value={day0.closeTime} class="input py-1 px-2 text-sm w-28" />
							</div>
						{:else}
							<input type="hidden" name="day_0_open" value="" />
							<input type="hidden" name="day_0_close" value="" />
						{/if}
					</div>

					<!-- Monday -->
					<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
						<div class="w-20 font-medium text-sm">Monday</div>
						<label class="flex items-center cursor-pointer">
							<input type="checkbox" name="day_1_closed" value="true" bind:checked={day1.isClosed} class="mr-2 cursor-pointer" />
							<span class="text-sm text-gray-600">Closed</span>
						</label>
						{#if !day1.isClosed}
							<div class="flex items-center gap-2 ml-auto">
								<input type="time" name="day_1_open" bind:value={day1.openTime} class="input py-1 px-2 text-sm w-28" />
								<span class="text-gray-400">to</span>
								<input type="time" name="day_1_close" bind:value={day1.closeTime} class="input py-1 px-2 text-sm w-28" />
							</div>
						{:else}
							<input type="hidden" name="day_1_open" value="" />
							<input type="hidden" name="day_1_close" value="" />
						{/if}
					</div>

					<!-- Tuesday -->
					<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
						<div class="w-20 font-medium text-sm">Tuesday</div>
						<label class="flex items-center cursor-pointer">
							<input type="checkbox" name="day_2_closed" value="true" bind:checked={day2.isClosed} class="mr-2 cursor-pointer" />
							<span class="text-sm text-gray-600">Closed</span>
						</label>
						{#if !day2.isClosed}
							<div class="flex items-center gap-2 ml-auto">
								<input type="time" name="day_2_open" bind:value={day2.openTime} class="input py-1 px-2 text-sm w-28" />
								<span class="text-gray-400">to</span>
								<input type="time" name="day_2_close" bind:value={day2.closeTime} class="input py-1 px-2 text-sm w-28" />
							</div>
						{:else}
							<input type="hidden" name="day_2_open" value="" />
							<input type="hidden" name="day_2_close" value="" />
						{/if}
					</div>

					<!-- Wednesday -->
					<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
						<div class="w-20 font-medium text-sm">Wednesday</div>
						<label class="flex items-center cursor-pointer">
							<input type="checkbox" name="day_3_closed" value="true" bind:checked={day3.isClosed} class="mr-2 cursor-pointer" />
							<span class="text-sm text-gray-600">Closed</span>
						</label>
						{#if !day3.isClosed}
							<div class="flex items-center gap-2 ml-auto">
								<input type="time" name="day_3_open" bind:value={day3.openTime} class="input py-1 px-2 text-sm w-28" />
								<span class="text-gray-400">to</span>
								<input type="time" name="day_3_close" bind:value={day3.closeTime} class="input py-1 px-2 text-sm w-28" />
							</div>
						{:else}
							<input type="hidden" name="day_3_open" value="" />
							<input type="hidden" name="day_3_close" value="" />
						{/if}
					</div>

					<!-- Thursday -->
					<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
						<div class="w-20 font-medium text-sm">Thursday</div>
						<label class="flex items-center cursor-pointer">
							<input type="checkbox" name="day_4_closed" value="true" bind:checked={day4.isClosed} class="mr-2 cursor-pointer" />
							<span class="text-sm text-gray-600">Closed</span>
						</label>
						{#if !day4.isClosed}
							<div class="flex items-center gap-2 ml-auto">
								<input type="time" name="day_4_open" bind:value={day4.openTime} class="input py-1 px-2 text-sm w-28" />
								<span class="text-gray-400">to</span>
								<input type="time" name="day_4_close" bind:value={day4.closeTime} class="input py-1 px-2 text-sm w-28" />
							</div>
						{:else}
							<input type="hidden" name="day_4_open" value="" />
							<input type="hidden" name="day_4_close" value="" />
						{/if}
					</div>

					<!-- Friday -->
					<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
						<div class="w-20 font-medium text-sm">Friday</div>
						<label class="flex items-center cursor-pointer">
							<input type="checkbox" name="day_5_closed" value="true" bind:checked={day5.isClosed} class="mr-2 cursor-pointer" />
							<span class="text-sm text-gray-600">Closed</span>
						</label>
						{#if !day5.isClosed}
							<div class="flex items-center gap-2 ml-auto">
								<input type="time" name="day_5_open" bind:value={day5.openTime} class="input py-1 px-2 text-sm w-28" />
								<span class="text-gray-400">to</span>
								<input type="time" name="day_5_close" bind:value={day5.closeTime} class="input py-1 px-2 text-sm w-28" />
							</div>
						{:else}
							<input type="hidden" name="day_5_open" value="" />
							<input type="hidden" name="day_5_close" value="" />
						{/if}
					</div>

					<!-- Saturday -->
					<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
						<div class="w-20 font-medium text-sm">Saturday</div>
						<label class="flex items-center cursor-pointer">
							<input type="checkbox" name="day_6_closed" value="true" bind:checked={day6.isClosed} class="mr-2 cursor-pointer" />
							<span class="text-sm text-gray-600">Closed</span>
						</label>
						{#if !day6.isClosed}
							<div class="flex items-center gap-2 ml-auto">
								<input type="time" name="day_6_open" bind:value={day6.openTime} class="input py-1 px-2 text-sm w-28" />
								<span class="text-gray-400">to</span>
								<input type="time" name="day_6_close" bind:value={day6.closeTime} class="input py-1 px-2 text-sm w-28" />
							</div>
						{:else}
							<input type="hidden" name="day_6_open" value="" />
							<input type="hidden" name="day_6_close" value="" />
						{/if}
					</div>

					<!-- Quick set buttons -->
					<div class="flex gap-2 pt-2 border-t">
						<button type="button" on:click={() => setQuickHours('weekdays')} class="text-xs text-primary-600 hover:text-primary-700">
							Mon-Fri 9-5
						</button>
						<button type="button" on:click={() => setQuickHours('all')} class="text-xs text-primary-600 hover:text-primary-700">
							7 Days 10-6
						</button>
						<button type="button" on:click={() => setQuickHours('clear')} class="text-xs text-gray-600 hover:text-gray-700">
							Clear All
						</button>
					</div>
				</div>

				<!-- Sticky footer with buttons -->
				<div class="p-4 border-t bg-gray-50 flex space-x-3">
					<button type="button" on:click={() => editingHoursLocation = null} class="btn-secondary flex-1">
						Cancel
					</button>
					<button type="submit" disabled={loading} class="btn-primary flex-1">
						{loading ? 'Saving...' : 'Save Hours'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
