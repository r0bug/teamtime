<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: locations = data.locations;
</script>

<svelte:head>
	<title>Manage Locations - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">Locations</h1>
		<a href="/admin/locations/new" class="btn-primary">
			<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			Add Location
		</a>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		{#each locations as location}
			<a href="/admin/locations/{location.id}" class="card hover:shadow-md transition-shadow">
				<div class="card-body">
					<div class="flex items-start justify-between">
						<div>
							<h3 class="font-semibold text-lg">{location.name}</h3>
							{#if location.address}
								<p class="text-gray-600 text-sm mt-1">{location.address}</p>
							{/if}
							{#if location.lat && location.lng}
								<p class="text-xs text-gray-400 mt-1">
									{location.lat}, {location.lng}
								</p>
							{/if}
						</div>
						<div>
							{#if location.isActive}
								<span class="badge-success">Active</span>
							{:else}
								<span class="badge-danger">Inactive</span>
							{/if}
						</div>
					</div>
				</div>
			</a>
		{:else}
			<div class="col-span-2 text-center py-12">
				<svg class="mx-auto w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
				</svg>
				<p class="mt-2 text-gray-600">No locations added yet</p>
				<a href="/admin/locations/new" class="btn-primary mt-4">Add Your First Location</a>
			</div>
		{/each}
	</div>
</div>
