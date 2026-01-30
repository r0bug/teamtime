<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import Avatar from '$lib/components/Avatar.svelte';

	export let data: PageData;
	export let form: ActionData;

	$: user = data.user;

	let loading = false;
	let showResetPinModal = false;
</script>

<svelte:head>
	<title>Edit {user.name} - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/admin/users" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<Avatar src={user.avatarUrl} name={user.name} size="lg" />
			<div>
				<h1 class="text-2xl font-bold">{user.name}</h1>
				<p class="text-sm text-gray-500 capitalize">{user.role}</p>
			</div>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				{form.pinReset ? 'PIN reset successfully' : 'User updated successfully'}
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
					<div class="grid gap-6 lg:grid-cols-2">
						<div>
							<label for="name" class="label">Full Name *</label>
							<input
								type="text"
								id="name"
								name="name"
								required
								class="input"
								value={user.name}
							/>
						</div>

						<div>
							<label for="username" class="label">Username *</label>
							<input
								type="text"
								id="username"
								name="username"
								required
								pattern="[a-z0-9_]+"
								class="input"
								value={user.username}
							/>
						</div>

						<div>
							<label for="email" class="label">Email *</label>
							<input
								type="email"
								id="email"
								name="email"
								required
								class="input"
								value={user.email}
							/>
						</div>

						<div>
							<label for="phone" class="label">Phone</label>
							<input
								type="tel"
								id="phone"
								name="phone"
								class="input"
								value={user.phone || ''}
							/>
						</div>

						<div>
							<label for="role" class="label">Role *</label>
							<select id="role" name="role" required class="input">
								<option value="staff" selected={user.role === 'staff'}>Staff</option>
								<option value="purchaser" selected={user.role === 'purchaser'}>Purchaser</option>
								<option value="manager" selected={user.role === 'manager'}>Manager</option>
							</select>
						</div>

						<div>
							<label for="primaryLocationId" class="label">Primary Location</label>
							<select id="primaryLocationId" name="primaryLocationId" class="input">
								<option value="">-- No default location --</option>
								{#each data.locations as location}
									<option value={location.id} selected={user.primaryLocationId === location.id}>{location.name}</option>
								{/each}
							</select>
							<p class="text-xs text-gray-500 mt-1">Default work location for scheduling rules</p>
						</div>

						<div class="flex items-center">
							<label class="flex items-center gap-3">
								<input
									type="checkbox"
									name="isActive"
									checked={user.isActive}
									class="w-5 h-5 rounded border-gray-300"
								/>
								<span>Account Active</span>
							</label>
						</div>
					</div>

					<!-- Special Permissions -->
					<div class="border-t pt-6">
						<h3 class="text-sm font-medium text-gray-700 mb-4">Special Permissions</h3>
						<div class="space-y-3">
							<label class="flex items-center gap-3">
								<input
									type="checkbox"
									name="canListOnEbay"
									checked={user.canListOnEbay}
									class="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
								/>
								<div>
									<span class="font-medium text-gray-900">Can List on eBay</span>
									<p class="text-sm text-gray-500">Allow this user to claim and complete eBay listing tasks</p>
								</div>
							</label>
						</div>
					</div>

					<div class="flex gap-4 pt-4">
						<a href="/admin/users" class="btn-ghost flex-1 text-center">Cancel</a>
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

		<!-- PIN Reset -->
		<div class="card mb-6">
			<div class="card-body">
				<h2 class="text-lg font-semibold mb-4">Reset PIN</h2>
				<p class="text-gray-600 mb-4">Reset this user's PIN to allow them to log in with a new code.</p>
				<button on:click={() => showResetPinModal = true} class="btn-ghost border border-gray-300">
					Reset PIN
				</button>
			</div>
		</div>

		<!-- Delete User -->
		<div class="card border-red-200">
			<div class="card-body">
				<h2 class="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
				<p class="text-gray-600 mb-4">Deleting this user will permanently remove all their data including time entries, tasks, and messages.</p>
				<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
					if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
						cancel();
					}
				}}>
					<button
						type="submit"
						class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
					>
						Delete User
					</button>
				</form>
			</div>
		</div>
	</div>
</div>

<!-- Reset PIN Modal -->
{#if showResetPinModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg max-w-md w-full p-6">
			<h3 class="text-lg font-semibold mb-4">Reset PIN for {user.name}</h3>
			<form
				method="POST"
				action="?/resetPin"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showResetPinModal = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="newPin" class="label">New PIN *</label>
					<input
						type="text"
						id="newPin"
						name="newPin"
						required
						pattern="\d{4,8}"
						inputmode="numeric"
						class="input font-mono tracking-widest"
						placeholder="Enter 4-8 digit PIN"
					/>
					<p class="text-xs text-gray-500 mt-1">4-8 digits required</p>
				</div>

				<div class="flex gap-4 pt-4">
					<button type="button" on:click={() => showResetPinModal = false} class="btn-ghost flex-1">Cancel</button>
					<button type="submit" disabled={loading} class="btn-primary flex-1">
						{loading ? 'Resetting...' : 'Reset PIN'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
