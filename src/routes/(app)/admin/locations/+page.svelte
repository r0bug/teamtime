<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let editingLocation: typeof data.locations[0] | null = null;
	let loading = false;
</script>

<svelte:head>
	<title>Locations - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div class="flex justify-between items-center mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Locations</h1>
			<p class="text-gray-600 mt-1">Manage work locations</p>
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
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coordinates</th>
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
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{#if location.lat && location.lng}
										{location.lat}, {location.lng}
									{:else}
										-
									{/if}
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
									<span class="px-2 py-1 text-xs font-medium rounded-full {location.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
										{location.isActive ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
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
