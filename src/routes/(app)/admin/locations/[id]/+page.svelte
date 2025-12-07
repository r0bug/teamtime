<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: location = data.location;

	let loading = false;
</script>

<svelte:head>
	<title>Edit {location.name} - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/admin/locations" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">Edit Location</h1>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				Location updated successfully
			</div>
		{/if}

		<div class="card mb-6">
			<div class="card-body">
				<form
					method="POST"
					action="?/update"
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
							value={location.name}
						/>
					</div>

					<div>
						<label for="address" class="label">Address</label>
						<textarea
							id="address"
							name="address"
							rows="2"
							class="input"
						>{location.address || ''}</textarea>
					</div>

					<div class="grid gap-6 lg:grid-cols-2">
						<div>
							<label for="lat" class="label">Latitude</label>
							<input
								type="text"
								id="lat"
								name="lat"
								class="input"
								value={location.lat || ''}
							/>
						</div>

						<div>
							<label for="lng" class="label">Longitude</label>
							<input
								type="text"
								id="lng"
								name="lng"
								class="input"
								value={location.lng || ''}
							/>
						</div>
					</div>

					<div class="flex items-center">
						<label class="flex items-center gap-3">
							<input
								type="checkbox"
								name="isActive"
								checked={location.isActive}
								class="w-5 h-5 rounded border-gray-300"
							/>
							<span>Location Active</span>
						</label>
					</div>

					<div class="flex gap-4 pt-4">
						<a href="/admin/locations" class="btn-ghost flex-1 text-center">Cancel</a>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{#if loading}
								Saving...
							{:else}
								Save Changes
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>

		<!-- Delete Location -->
		<div class="card border-red-200">
			<div class="card-body">
				<h2 class="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
				<p class="text-gray-600 mb-4">Deleting this location will remove it from all shifts. This action cannot be undone.</p>
				<form method="POST" action="?/delete">
					<button
						type="submit"
						class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
						onclick="return confirm('Are you sure you want to delete this location?')"
					>
						Delete Location
					</button>
				</form>
			</div>
		</div>
	</div>
</div>
