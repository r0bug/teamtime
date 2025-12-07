<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import AvatarUpload from '$lib/components/AvatarUpload.svelte';

	export let data: PageData;
	export let form: ActionData;

	$: user = data.user;

	let name = user?.name || '';
	let phone = user?.phone || '';
	let currentAvatar = user?.avatarUrl || null;
	let loading = false;

	function handleAvatarChange() {
		invalidateAll();
	}
</script>

<svelte:head>
	<title>Settings - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-2xl mx-auto">
	<h1 class="text-2xl font-bold mb-6">Settings</h1>

	<!-- Profile Photo Section -->
	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Profile Photo</h2>
		</div>
		<div class="card-body">
			<AvatarUpload
				currentAvatar={currentAvatar}
				name={user?.name || ''}
				size="lg"
				on:change={handleAvatarChange}
			/>
		</div>
	</div>

	<!-- Profile Section -->
	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Profile</h2>
		</div>
		<div class="card-body">
			{#if form?.success}
				<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
					Profile updated successfully!
				</div>
			{/if}

			{#if form?.error}
				<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				action="?/updateProfile"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="email" class="label">Email</label>
					<input type="email" id="email" value={user?.email} disabled class="input bg-gray-100" />
					<p class="text-xs text-gray-500 mt-1">Contact your administrator to change your email</p>
				</div>

				<div>
					<label for="name" class="label">Name</label>
					<input type="text" id="name" name="name" bind:value={name} required class="input" />
				</div>

				<div>
					<label for="phone" class="label">Phone</label>
					<input type="tel" id="phone" name="phone" bind:value={phone} class="input" />
				</div>

				<button type="submit" disabled={loading} class="btn-primary">
					{loading ? 'Saving...' : 'Save Changes'}
				</button>
			</form>
		</div>
	</div>

	<!-- Change PIN Section -->
	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Change PIN</h2>
		</div>
		<div class="card-body">
			<form
				method="POST"
				action="?/changePin"
				use:enhance
				class="space-y-4"
			>
				<div>
					<label for="currentPin" class="label">Current PIN</label>
					<input type="password" id="currentPin" name="currentPin" required inputmode="numeric" pattern="[0-9]*" class="input" />
				</div>

				<div>
					<label for="newPin" class="label">New PIN</label>
					<input type="password" id="newPin" name="newPin" required inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" class="input" />
					<p class="text-xs text-gray-500 mt-1">Must be 4-8 digits</p>
				</div>

				<div>
					<label for="confirmPin" class="label">Confirm New PIN</label>
					<input type="password" id="confirmPin" name="confirmPin" required inputmode="numeric" pattern="[0-9]*" class="input" />
				</div>

				<button type="submit" class="btn-primary">Change PIN</button>
			</form>
		</div>
	</div>

	<!-- Notification Settings -->
	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Notifications</h2>
		</div>
		<div class="card-body">
			<a href="/settings/notifications" class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
				<span>Manage Notification Preferences</span>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</a>
		</div>
	</div>

	<!-- Logout -->
	<form method="POST" action="/logout">
		<button type="submit" class="btn-danger w-full">
			Sign Out
		</button>
	</form>

	<p class="text-center text-sm text-gray-500 mt-6">
		TeamTime v0.0.1
	</p>
</div>
