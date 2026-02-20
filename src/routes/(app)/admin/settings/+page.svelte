<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: twoFAEnabled = data.settings['2fa_enabled'] === 'true';
	$: pinOnlyLogin = data.settings['pin_only_login'] !== 'false'; // Default to true
	$: showLaborCost = data.settings['show_labor_cost'] === 'true';
	$: managersCanResetPins = data.settings['managers_can_reset_pins'] === 'true';
	$: siteTitle = data.settings['site_title'] || 'TeamTime';
	$: clockOutGracePeriod = parseInt(data.settings['clock_out_grace_period_minutes'] || '30', 10);

	// Module toggle state
	$: enabledModulesRaw = data.settings['enabled_modules'];
	$: enabledModules = (() => {
		try { return enabledModulesRaw ? JSON.parse(enabledModulesRaw) : {}; } catch { return {}; }
	})();

	const moduleList = [
		{ key: 'tasks', label: 'Tasks', desc: 'Task management and assignment' },
		{ key: 'schedule', label: 'Schedule', desc: 'Shift scheduling and calendar' },
		{ key: 'messages', label: 'Messages', desc: 'Team messaging and threads' },
		{ key: 'expenses', label: 'Expenses', desc: 'Expense tracking and ATM withdrawals' },
		{ key: 'leaderboard', label: 'Leaderboard', desc: 'Points leaderboard and rankings' },
		{ key: 'achievements', label: 'Achievements', desc: 'Achievement badges and streaks' },
		{ key: 'sales', label: 'Sales', desc: 'Sales data and reporting' },
		{ key: 'pricing', label: 'Pricing', desc: 'Item pricing workflow' },
		{ key: 'inventory', label: 'Inventory', desc: 'Inventory drops and processing' },
		{ key: 'ebay', label: 'eBay', desc: 'eBay listing tasks' },
		{ key: 'notifications', label: 'Notifications', desc: 'Push and email notifications' },
		{ key: 'reports', label: 'Reports', desc: 'Reporting and analytics' }
	];

	function isModuleEnabled(key: string): boolean {
		return enabledModules[key] !== false; // Default to enabled
	}

	let editingSiteTitle = false;
	let siteTitleInput = '';

	function startEditSiteTitle() {
		siteTitleInput = siteTitle;
		editingSiteTitle = true;
	}
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

				<div class="border-t pt-4 mt-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-medium">PIN Only Login</h3>
							<p class="text-sm text-gray-500 mt-1">
								When enabled, users log in with PIN only. When disabled, users must use a password.
							</p>
						</div>
						<form method="POST" action="?/togglePinOnlyLogin" use:enhance>
							<button
								type="submit"
								class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {pinOnlyLogin ? 'bg-primary-600' : 'bg-gray-200'}"
							>
								<span
									class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {pinOnlyLogin ? 'translate-x-5' : 'translate-x-0'}"
								/>
							</button>
						</form>
					</div>
					<div class="mt-3">
						<p class="text-sm text-gray-600">
							<strong>Current status:</strong>
							{#if pinOnlyLogin}
								<span class="text-green-600">PIN Login</span> - Users authenticate with their PIN.
							{:else}
								<span class="text-blue-600">Password Login</span> - Users must authenticate with a password.
							{/if}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Branding Settings -->
		<div class="card mt-6">
			<div class="card-header">
				<h2 class="font-semibold">Branding</h2>
			</div>
			<div class="card-body">
				<div class="py-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-medium">Site Title</h3>
							<p class="text-sm text-gray-500 mt-1">
								The name displayed in the header and browser tab.
							</p>
						</div>
						{#if !editingSiteTitle}
							<div class="flex items-center space-x-2">
								<span class="text-sm font-medium text-gray-900">{siteTitle}</span>
								<button
									type="button"
									on:click={startEditSiteTitle}
									class="text-primary-600 hover:text-primary-700 text-sm"
								>
									Edit
								</button>
							</div>
						{/if}
					</div>
					{#if editingSiteTitle}
						<form method="POST" action="?/updateSiteTitle" use:enhance={() => {
							return async ({ update }) => {
								await update();
								await invalidateAll();
								editingSiteTitle = false;
							};
						}} class="mt-3 flex items-center space-x-2">
							<input
								type="text"
								name="siteTitle"
								bind:value={siteTitleInput}
								class="input flex-1"
								placeholder="Enter site title"
							/>
							<button type="submit" class="btn-primary">Save</button>
							<button type="button" on:click={() => editingSiteTitle = false} class="btn-secondary">Cancel</button>
						</form>
					{/if}
				</div>
			</div>
		</div>

		<!-- User Management Settings -->
		<div class="card mt-6">
			<div class="card-header">
				<h2 class="font-semibold">User Management</h2>
			</div>
			<div class="card-body">
				<div class="flex items-center justify-between py-4">
					<div>
						<h3 class="font-medium">Show Labor Cost Column</h3>
						<p class="text-sm text-gray-500 mt-1">
							Display the labor cost column on the Users page. This is the rounded overhead cost per hour (pay + employer match).
						</p>
					</div>
					<form method="POST" action="?/toggleLaborCost" use:enhance>
						<button
							type="submit"
							class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {showLaborCost ? 'bg-primary-600' : 'bg-gray-200'}"
						>
							<span
								class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {showLaborCost ? 'translate-x-5' : 'translate-x-0'}"
							/>
						</button>
					</form>
				</div>

				<div class="border-t pt-4 mt-4">
					<p class="text-sm text-gray-600">
						<strong>Current status:</strong>
						{#if showLaborCost}
							<span class="text-green-600">Visible</span> - Labor cost column is shown on the Users page.
						{:else}
							<span class="text-gray-600">Hidden</span> - Labor cost column is hidden from the Users page.
						{/if}
					</p>
				</div>

				<div class="border-t pt-4 mt-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-medium">Managers Can Reset PINs</h3>
							<p class="text-sm text-gray-500 mt-1">
								Allow managers to reset user PINs. Admins can always reset PINs.
							</p>
						</div>
						<form method="POST" action="?/toggleManagerPinReset" use:enhance>
							<button
								type="submit"
								class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {managersCanResetPins ? 'bg-primary-600' : 'bg-gray-200'}"
							>
								<span
									class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {managersCanResetPins ? 'translate-x-5' : 'translate-x-0'}"
								/>
							</button>
						</form>
					</div>
					<div class="mt-3">
						<p class="text-sm text-gray-600">
							<strong>Current status:</strong>
							{#if managersCanResetPins}
								<span class="text-green-600">Enabled</span> - Managers can reset user PINs.
							{:else}
								<span class="text-gray-600">Disabled</span> - Only admins can reset user PINs.
							{/if}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Attendance & Clock-Out Settings -->
		<div class="card mt-6">
			<div class="card-header">
				<h2 class="font-semibold">Attendance & Clock-Out</h2>
			</div>
			<div class="card-body">
				<div class="py-4">
					<form method="POST" action="?/updateClockOutGracePeriod" use:enhance={() => {
						return async ({ update }) => {
							await update();
							await invalidateAll();
						};
					}} class="space-y-3">
						<div>
							<label for="gracePeriod" class="font-medium text-sm">Clock-Out Grace Period (minutes)</label>
							<p class="text-xs text-gray-500 mt-1">
								How many minutes after a shift ends before an auto-reminder SMS is sent. Users with no scheduled shift get reminded after 10 hours.
							</p>
						</div>
						<div class="flex items-center space-x-3">
							<input
								type="number"
								id="gracePeriod"
								name="gracePeriod"
								value={clockOutGracePeriod}
								min="0"
								max="480"
								class="input w-24"
							/>
							<span class="text-sm text-gray-500">minutes</span>
							<button type="submit" class="btn-primary text-sm">Save</button>
						</div>
					</form>
				</div>
			</div>
		</div>

		<!-- Module Toggles -->
		<div class="card mt-6">
			<div class="card-header">
				<h2 class="font-semibold">Module Settings</h2>
				<p class="text-sm text-gray-500 mt-1">Enable or disable system modules. Disabled modules are hidden from navigation.</p>
			</div>
			<div class="card-body divide-y">
				{#each moduleList as mod}
					<div class="flex items-center justify-between py-3">
						<div>
							<h3 class="font-medium text-sm">{mod.label}</h3>
							<p class="text-xs text-gray-500">{mod.desc}</p>
						</div>
						<form method="POST" action="?/toggleModule" use:enhance={() => {
							return async ({ update }) => {
								await update();
								await invalidateAll();
							};
						}}>
							<input type="hidden" name="module" value={mod.key} />
							<button
								type="submit"
								class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {isModuleEnabled(mod.key) ? 'bg-primary-600' : 'bg-gray-200'}"
							>
								<span
									class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isModuleEnabled(mod.key) ? 'translate-x-5' : 'translate-x-0'}"
								/>
							</button>
						</form>
					</div>
				{/each}
			</div>
		</div>

		<!-- System Backup -->
		<div class="card mt-6">
			<div class="card-header">
				<h2 class="font-semibold">System Backup</h2>
			</div>
			<div class="card-body">
				<div class="py-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-medium">Download Backup</h3>
							<p class="text-sm text-gray-500 mt-1">
								Download a ZIP file containing all settings and a database dump.
							</p>
						</div>
						<a
							href="/api/backup"
							class="btn-primary inline-flex items-center"
							download
						>
							<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
							</svg>
							Download Backup
						</a>
					</div>
					<div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
						<p class="text-sm text-yellow-800">
							<strong>Note:</strong> Backups contain sensitive data including user information. Store them securely.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
