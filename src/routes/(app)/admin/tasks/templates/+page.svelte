<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let loading: string | null = null;
	let deleteConfirm: string | null = null;

	const triggerTypeLabels: Record<string, string> = {
		clock_in: 'Clock In',
		clock_out: 'Clock Out',
		first_clock_in: 'First Clock-In',
		last_clock_out: 'Last Clock-Out'
	};

	function formatDate(date: Date | string): string {
		const d = new Date(date);
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Task Templates - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex justify-between items-center mb-6">
		<div>
			<nav class="text-sm text-gray-500 mb-2">
				<a href="/admin/tasks" class="hover:text-gray-700">Task Management</a>
				<span class="mx-2">/</span>
				<span>Templates</span>
			</nav>
			<h1 class="text-2xl font-bold text-gray-900">Task Templates</h1>
			<p class="text-gray-600 mt-1">Create and manage reusable task definitions</p>
		</div>
		<a href="/admin/tasks/templates/new" class="btn btn-primary">
			<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Template
		</a>
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

	{#if data.templates.length > 0}
		<div class="card">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requirements</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trigger</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rules</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.templates as template}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3">
									<div class="font-medium text-gray-900">{template.name}</div>
									{#if template.description}
										<div class="text-sm text-gray-500 truncate max-w-xs">{template.description}</div>
									{/if}
									<div class="text-xs text-gray-400">Updated {formatDate(template.updatedAt)}</div>
								</td>
								<td class="px-4 py-3">
									<div class="flex gap-2">
										{#if template.photoRequired}
											<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
												<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
												</svg>
												Photo
											</span>
										{/if}
										{#if template.notesRequired}
											<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
												<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
												Notes
											</span>
										{/if}
										{#if !template.photoRequired && !template.notesRequired}
											<span class="text-xs text-gray-400">None</span>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3">
									{#if template.triggerEvent}
										<span class="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
											{triggerTypeLabels[template.triggerEvent] || template.triggerEvent}
										</span>
									{:else}
										<span class="text-xs text-gray-400">Manual</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-sm text-gray-600">
									{template.locationName || 'All Locations'}
								</td>
								<td class="px-4 py-3">
									<a href="/admin/tasks/rules?templateId={template.id}" class="text-primary-600 hover:text-primary-700 text-sm">
										{template.ruleCount} rule{template.ruleCount !== 1 ? 's' : ''}
									</a>
								</td>
								<td class="px-4 py-3">
									<form
										method="POST"
										action="?/toggleActive"
										use:enhance={() => {
											loading = template.id;
											return async ({ update }) => {
												loading = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="templateId" value={template.id} />
										<input type="hidden" name="isActive" value={!template.isActive} />
										<button
											type="submit"
											disabled={loading === template.id}
											class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {template.isActive ? 'bg-primary-600' : 'bg-gray-200'}"
										>
											<span
												class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {template.isActive ? 'translate-x-5' : 'translate-x-0'}"
											></span>
										</button>
									</form>
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex justify-end gap-2">
										<a
											href="/admin/tasks/templates/{template.id}"
											class="text-gray-600 hover:text-gray-900"
											title="Edit"
										>
											<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
											</svg>
										</a>
										{#if deleteConfirm === template.id}
											<form
												method="POST"
												action="?/delete"
												use:enhance={() => {
													loading = `delete-${template.id}`;
													return async ({ update }) => {
														loading = null;
														deleteConfirm = null;
														await update();
													};
												}}
											>
												<input type="hidden" name="templateId" value={template.id} />
												<button
													type="submit"
													disabled={loading === `delete-${template.id}`}
													class="text-red-600 hover:text-red-900"
													title="Confirm delete"
												>
													<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
													</svg>
												</button>
											</form>
											<button
												type="button"
												class="text-gray-600 hover:text-gray-900"
												title="Cancel"
												on:click={() => (deleteConfirm = null)}
											>
												<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										{:else}
											<button
												type="button"
												class="text-gray-400 hover:text-red-600"
												title="Delete"
												on:click={() => (deleteConfirm = template.id)}
											>
												<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else}
		<div class="card">
			<div class="card-body text-center py-12">
				<svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
				</svg>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
				<p class="text-gray-600 mb-4">Create your first task template to get started with automated task assignment.</p>
				<a href="/admin/tasks/templates/new" class="btn btn-primary">
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Create Template
				</a>
			</div>
		</div>
	{/if}
</div>
