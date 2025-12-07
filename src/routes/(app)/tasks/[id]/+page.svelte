<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: task = data.task;
	$: isManager = data.isManager;

	let loading = false;
	let showCompleteModal = false;

	function getPriorityClass(priority: string) {
		switch (priority) {
			case 'urgent': return 'badge-danger';
			case 'high': return 'badge-warning';
			case 'medium': return 'badge-primary';
			default: return 'badge-gray';
		}
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'completed': return 'badge-success';
			case 'in_progress': return 'badge-primary';
			case 'cancelled': return 'badge-gray';
			default: return 'badge-warning';
		}
	}

	function formatDate(date: string | Date | null) {
		if (!date) return 'No due date';
		return new Date(date).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>{task.title} - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/tasks" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold flex-1">{task.title}</h1>
			<span class={getPriorityClass(task.priority)}>{task.priority}</span>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				{form.completed ? 'Task marked as completed!' : 'Task updated successfully'}
			</div>
		{/if}

		<div class="card mb-6">
			<div class="card-body space-y-4">
				<div class="flex items-center justify-between">
					<span class={getStatusClass(task.status)}>{task.status.replace('_', ' ')}</span>
					<span class="text-sm text-gray-500">Due: {formatDate(task.dueAt)}</span>
				</div>

				{#if task.description}
					<p class="text-gray-700">{task.description}</p>
				{/if}

				<div class="flex items-center gap-2 text-sm text-gray-600">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
					</svg>
					<span>Assigned to: {task.assigneeName || 'Unassigned'}</span>
				</div>

				<div class="flex flex-wrap gap-2 text-sm">
					{#if task.photoRequired}
						<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded">Photo Required</span>
					{/if}
					{#if task.notesRequired}
						<span class="bg-purple-100 text-purple-700 px-2 py-1 rounded">Notes Required</span>
					{/if}
				</div>

				{#if task.status !== 'completed' && task.status !== 'cancelled'}
					<div class="pt-4 border-t">
						<button on:click={() => showCompleteModal = true} class="btn-primary w-full">
							Mark as Complete
						</button>
					</div>
				{/if}
			</div>
		</div>

		{#if isManager}
			<div class="card">
				<div class="card-body">
					<h2 class="text-lg font-semibold mb-4">Edit Task</h2>
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
						class="space-y-4"
					>
						<div>
							<label for="title" class="label">Title *</label>
							<input type="text" id="title" name="title" required class="input" value={task.title} />
						</div>

						<div>
							<label for="description" class="label">Description</label>
							<textarea id="description" name="description" rows="3" class="input">{task.description || ''}</textarea>
						</div>

						<div class="grid gap-4 lg:grid-cols-2">
							<div>
								<label for="assignedTo" class="label">Assigned To</label>
								<select id="assignedTo" name="assignedTo" class="input">
									<option value="">Unassigned</option>
									{#each data.users as user}
										<option value={user.id} selected={user.id === task.assignedTo}>{user.name}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="priority" class="label">Priority</label>
								<select id="priority" name="priority" class="input">
									<option value="low" selected={task.priority === 'low'}>Low</option>
									<option value="medium" selected={task.priority === 'medium'}>Medium</option>
									<option value="high" selected={task.priority === 'high'}>High</option>
									<option value="urgent" selected={task.priority === 'urgent'}>Urgent</option>
								</select>
							</div>

							<div>
								<label for="status" class="label">Status</label>
								<select id="status" name="status" class="input">
									<option value="not_started" selected={task.status === 'not_started'}>Not Started</option>
									<option value="in_progress" selected={task.status === 'in_progress'}>In Progress</option>
									<option value="completed" selected={task.status === 'completed'}>Completed</option>
									<option value="cancelled" selected={task.status === 'cancelled'}>Cancelled</option>
								</select>
							</div>

							<div>
								<label for="dueAt" class="label">Due Date</label>
								<input type="datetime-local" id="dueAt" name="dueAt" class="input" value={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : ''} />
							</div>
						</div>

						<div class="flex gap-4 pt-4">
							<button type="submit" disabled={loading} class="btn-primary flex-1">
								{loading ? 'Saving...' : 'Save Changes'}
							</button>
						</div>
					</form>

					<form method="POST" action="?/delete" class="mt-4 pt-4 border-t">
						<button type="submit" class="text-red-600 hover:text-red-700 text-sm" onclick="return confirm('Are you sure you want to delete this task?')">
							Delete Task
						</button>
					</form>
				</div>
			</div>
		{/if}

		{#if data.completions.length > 0}
			<div class="card mt-6">
				<div class="card-body">
					<h2 class="text-lg font-semibold mb-4">Completion History</h2>
					<div class="space-y-3">
						{#each data.completions as completion}
							<div class="bg-gray-50 p-3 rounded-lg">
								<div class="flex justify-between text-sm">
									<span class="font-medium">{completion.completedByName}</span>
									<span class="text-gray-500">{formatDate(completion.completedAt)}</span>
								</div>
								{#if completion.notes}
									<p class="text-sm text-gray-600 mt-1">{completion.notes}</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Complete Task Modal -->
{#if showCompleteModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg max-w-md w-full p-6">
			<h3 class="text-lg font-semibold mb-4">Complete Task</h3>
			<form
				method="POST"
				action="?/complete"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showCompleteModal = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="notes" class="label">Completion Notes {task.notesRequired ? '*' : ''}</label>
					<textarea id="notes" name="notes" rows="3" class="input" required={task.notesRequired} placeholder="Add any notes about the completed task..."></textarea>
				</div>

				<div class="flex gap-4 pt-4">
					<button type="button" on:click={() => showCompleteModal = false} class="btn-ghost flex-1">Cancel</button>
					<button type="submit" disabled={loading} class="btn-primary flex-1">
						{loading ? 'Saving...' : 'Complete Task'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
