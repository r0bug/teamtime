<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	export let form: ActionData;

	let loading = false;
</script>

<svelte:head>
	<title>Add Location - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/admin/locations" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">Add New Location</h1>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		<div class="card">
			<div class="card-body">
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-6"
				>
					<div>
						<label for="name" class="label">Location Name *</label>
						<input
							type="text"
							id="name"
							name="name"
							required
							class="input"
							placeholder="e.g., Main Office, Warehouse A"
						/>
					</div>

					<div>
						<label for="address" class="label">Address</label>
						<textarea
							id="address"
							name="address"
							rows="2"
							class="input"
							placeholder="Full address..."
						></textarea>
					</div>

					<div class="grid gap-6 lg:grid-cols-2">
						<div>
							<label for="lat" class="label">Latitude</label>
							<input
								type="text"
								id="lat"
								name="lat"
								class="input"
								placeholder="e.g., 37.7749"
							/>
						</div>

						<div>
							<label for="lng" class="label">Longitude</label>
							<input
								type="text"
								id="lng"
								name="lng"
								class="input"
								placeholder="e.g., -122.4194"
							/>
						</div>
					</div>

					<p class="text-sm text-gray-500">
						Coordinates are optional but help with geofencing features.
					</p>

					<div class="flex gap-4 pt-4">
						<a href="/admin/locations" class="btn-ghost flex-1 text-center">Cancel</a>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{#if loading}
								Creating...
							{:else}
								Create Location
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
