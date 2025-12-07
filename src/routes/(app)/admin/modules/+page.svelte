<script lang="ts">
	import { enhance } from '$app/forms';

	export let data;

	let saving = false;
</script>

<svelte:head>
	<title>Module Management - Admin</title>
</svelte:head>

<div class="p-4 lg:p-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Module Management</h1>
		<p class="text-gray-600">Enable or disable system modules</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each data.modules as module}
			<div class="bg-white rounded-xl shadow-sm border p-4">
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<h3 class="text-lg font-semibold text-gray-900">{module.name}</h3>
						<p class="text-sm text-gray-500 mt-1">{module.description}</p>
					</div>
					<form
						method="POST"
						action="?/toggle"
						use:enhance={() => {
							saving = true;
							return async ({ update }) => {
								await update();
								saving = false;
							};
						}}
					>
						<input type="hidden" name="moduleKey" value={module.key} />
						<input type="hidden" name="enabled" value={!module.enabled} />
						<button
							type="submit"
							disabled={saving}
							class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50
								{module.enabled ? 'bg-blue-600' : 'bg-gray-200'}
							"
							role="switch"
							aria-checked={module.enabled}
						>
							<span
								class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
									{module.enabled ? 'translate-x-5' : 'translate-x-0'}
								"
							/>
						</button>
					</form>
				</div>
				<div class="mt-3 pt-3 border-t">
					<span class="text-xs font-medium px-2 py-1 rounded-full
						{module.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}
					">
						{module.enabled ? 'Enabled' : 'Disabled'}
					</span>
				</div>
			</div>
		{/each}
	</div>

	<div class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
		<div class="flex items-start gap-3">
			<svg class="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
				<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
			</svg>
			<div>
				<h4 class="text-sm font-medium text-yellow-800">Important Note</h4>
				<p class="text-sm text-yellow-700 mt-1">
					Disabling a module will hide it from the navigation but will not delete any existing data.
					Users will not be able to access disabled modules until they are re-enabled.
				</p>
			</div>
		</div>
	</div>
</div>
