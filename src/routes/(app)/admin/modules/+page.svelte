<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let loading: string | null = null;
</script>

<svelte:head>
	<title>System Modules - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">System Modules</h1>
		<p class="text-gray-600 mt-1">Enable or disable system features</p>
	</div>

	<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
		<p class="text-sm text-yellow-800">
			<strong>Admin Only:</strong> Disabling a module will hide it from navigation but data is preserved.
		</p>
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

	<div class="space-y-4">
		{#each data.modules as module}
			<div class="card">
				<div class="card-body flex items-center justify-between">
					<div class="flex-1">
						<h3 class="font-semibold text-gray-900">{module.name}</h3>
						<p class="text-sm text-gray-600">{module.description}</p>
					</div>
					<form
						method="POST"
						action="?/toggleModule"
						use:enhance={() => {
							loading = module.key;
							return async ({ update }) => {
								loading = null;
								await update();
							};
						}}
					>
						<input type="hidden" name="moduleKey" value={module.key} />
						<input type="hidden" name="enabled" value={!module.enabled} />
						<button
							type="submit"
							disabled={loading === module.key}
							class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {module.enabled ? 'bg-primary-600' : 'bg-gray-200'}"
						>
							<span
								class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {module.enabled ? 'translate-x-5' : 'translate-x-0'}"
							></span>
						</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
</div>
