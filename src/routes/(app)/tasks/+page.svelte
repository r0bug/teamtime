<script lang="ts">
	import { enhance } from '$app/forms';
	import { browser } from '$app/environment';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: tasks = data.tasks;
	$: user = data.user;
	$: isManager = user?.role === 'manager' || user?.role === 'admin';
	$: isAdmin = user?.role === 'admin';

	let filter: 'all' | 'not_started' | 'in_progress' | 'completed' = 'all';

	// Hide completed toggle - persisted in localStorage for admin users
	let hideCompleted = false;

	// Load preference from localStorage on mount
	$: if (browser && isAdmin) {
		const stored = localStorage.getItem('tasks_hideCompleted');
		if (stored !== null) {
			hideCompleted = stored === 'true';
		}
	}

	function toggleHideCompleted() {
		hideCompleted = !hideCompleted;
		if (browser) {
			localStorage.setItem('tasks_hideCompleted', String(hideCompleted));
		}
	}

	$: filteredTasks = (() => {
		let result = tasks;

		// Apply status filter
		if (filter !== 'all') {
			result = result.filter(t => t.status === filter);
		}

		// Apply hide completed filter (for admin users)
		if (isAdmin && hideCompleted && filter === 'all') {
			result = result.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
		}

		return result;
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
	<div class="flex flex-wrap items-center gap-2 mb-6">
		<div class="flex space-x-2 overflow-x-auto pb-2">
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

		{#if isAdmin}
			<div class="flex items-center ml-auto">
				<label class="flex items-center cursor-pointer">
					<input
						type="checkbox"
						checked={hideCompleted}
						on:change={toggleHideCompleted}
						class="sr-only peer"
					/>
					<div class="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
					<span class="ms-3 text-sm font-medium text-gray-700">Hide Completed</span>
				</label>
			</div>
		{/if}
	</div>

	<!-- Task List -->
	<div class="space-y-3">
		{#each filteredTasks as task}
			<div class="card hover:shadow-md transition-shadow">
				<div class="card-body">
					<div class="flex items-start justify-between">
						<a href="/tasks/{task.id}" class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-1">
								<span class={getPriorityColor(task.priority)}>{task.priority}</span>
								<span class={getStatusColor(task.status)}>{task.status.replace('_', ' ')}</span>
							</div>
							<h3 class="font-semibold text-gray-900">{task.title}</h3>
							{#if task.description}
								<p class="text-gray-600 text-sm mt-1 line-clamp-2">{task.description}</p>
							{/if}
							<div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
								{#if task.assignmentType === 'all_staff'}
									<span class="flex items-center text-primary-600 font-medium">
										<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
										</svg>
										All Staff
										{#if task.totalStaff}
											<span class="ml-1 text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
												{task.completionCount}/{task.totalStaff}
											</span>
										{/if}
									</span>
								{:else if task.assignee}
									<span class="flex items-center">
										<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
										</svg>
										{task.assignee.name}
									</span>
								{/if}
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
						</a>
						<div class="flex items-center gap-1 ml-2 flex-shrink-0">
							{#if isManager}
								<!-- Edit button -->
								<a href="/tasks/{task.id}" class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit task">
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
									</svg>
								</a>
								<!-- Delete button -->
								<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
									if (!confirm('Delete this task?')) {
										cancel();
									}
								}} class="inline">
									<input type="hidden" name="taskId" value={task.id} />
									<button
										type="submit"
										class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
										title="Delete task"
									>
										<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</form>
							{:else}
								<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							{/if}
						</div>
					</div>
				</div>
			</div>
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
