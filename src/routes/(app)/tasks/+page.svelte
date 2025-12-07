<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;

	$: tasks = data.tasks;
	$: user = data.user;
	$: isManager = user?.role === 'manager';

	let filter: 'all' | 'not_started' | 'in_progress' | 'completed' = 'all';

	$: filteredTasks = (() => {
		if (filter === 'all') return tasks;
		return tasks.filter(t => t.status === filter);
	})();

	function setFilter(value: string) {
		filter = value as 'all' | 'not_started' | 'in_progress' | 'completed';
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'urgent': return 'badge-danger';
			case 'high': return 'badge-warning';
			case 'medium': return 'badge-primary';
			default: return 'badge-gray';
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'completed': return 'badge-success';
			case 'in_progress': return 'badge-primary';
			case 'cancelled': return 'badge-gray';
			default: return 'badge-warning';
		}
	}
</script>

<svelte:head>
	<title>Tasks - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">Tasks</h1>
		{#if isManager}
			<a href="/tasks/new" class="btn-primary">
				<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				New Task
			</a>
		{/if}
	</div>

	<!-- Filter Tabs -->
	<div class="flex space-x-2 mb-6 overflow-x-auto pb-2">
		{#each [
			{ value: 'all', label: 'All' },
			{ value: 'not_started', label: 'To Do' },
			{ value: 'in_progress', label: 'In Progress' },
			{ value: 'completed', label: 'Done' }
		] as tab}
			<button
				on:click={() => setFilter(tab.value)}
				class="px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors {filter === tab.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Task List -->
	<div class="space-y-3">
		{#each filteredTasks as task}
			<a href="/tasks/{task.id}" class="card block hover:shadow-md transition-shadow">
				<div class="card-body">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span class={getPriorityColor(task.priority)}>{task.priority}</span>
								<span class={getStatusColor(task.status)}>{task.status.replace('_', ' ')}</span>
							</div>
							<h3 class="font-semibold text-gray-900">{task.title}</h3>
							{#if task.description}
								<p class="text-gray-600 text-sm mt-1 line-clamp-2">{task.description}</p>
							{/if}
							<div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
								{#if task.dueAt}
									<span class="flex items-center">
										<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
										Due {new Date(task.dueAt).toLocaleDateString()}
									</span>
								{/if}
								{#if task.photoRequired}
									<span class="flex items-center">
										<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										Photo required
									</span>
								{/if}
							</div>
						</div>
						<svg class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</div>
				</div>
			</a>
		{:else}
			<div class="text-center py-12">
				<svg class="mx-auto w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
				</svg>
				<p class="mt-2 text-gray-600">No tasks found</p>
			</div>
		{/each}
	</div>
</div>
