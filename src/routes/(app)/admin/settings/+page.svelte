<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: twoFAEnabled = data.settings['2fa_enabled'] === 'true';
</script>

<svelte:head>
	<title>Settings - TeamTime Admin</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<h1 class="text-2xl font-bold mb-6">System Settings</h1>

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				Settings updated successfully
			</div>
		{/if}

		<div class="card">
			<div class="card-header">
				<h2 class="font-semibold">Authentication</h2>
			</div>
			<div class="card-body">
				<div class="flex items-center justify-between py-4">
					<div>
						<h3 class="font-medium">Two-Factor Authentication (2FA)</h3>
						<p class="text-sm text-gray-500 mt-1">
							Require email verification code when logging in from new devices
						</p>
					</div>
					<form method="POST" action="?/toggle2FA" use:enhance>
						<button
							type="submit"
							class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {twoFAEnabled ? 'bg-primary-600' : 'bg-gray-200'}"
						>
							<span
								class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {twoFAEnabled ? 'translate-x-5' : 'translate-x-0'}"
							/>
						</button>
					</form>
				</div>

				<div class="border-t pt-4 mt-4">
					<p class="text-sm text-gray-600">
						<strong>Current status:</strong>
						{#if twoFAEnabled}
							<span class="text-green-600">Enabled</span> - Users will need to verify via email when logging in from new devices.
						{:else}
							<span class="text-orange-600">Disabled</span> - Users can log in with just their PIN (for testing).
						{/if}
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
