<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import CashCountForm from '$lib/components/CashCountForm.svelte';
	import SocialMediaMetricsForm from '$lib/components/SocialMediaMetricsForm.svelte';

	export let data: PageData;
	export let form: ActionData;

	$: task = data.task;
	$: isManager = data.isManager;
	$: cashCountConfig = data.cashCountConfig;
	$: isCashCountTask = cashCountConfig !== null;
	$: socialMediaConfig = data.socialMediaConfig;
	$: isSocialMediaTask = socialMediaConfig !== null;
	$: isAllStaffTask = task.assignmentType === 'all_staff';
	$: totalStaff = data.totalStaff || 0;
	$: completionCount = data.completions?.length || 0;
	$: userHasCompleted = data.userHasCompleted;

	let loading = false;
	let showCompleteModal = false;
	let cashCountError = '';

	async function handleSocialMediaSubmit(event: CustomEvent) {
		loading = true;
		try {
			const response = await fetch(`/tasks/${task.id}?/complete`, {
				method: 'POST',
				body: new FormData()
			});
			if (response.ok) {
				showCompleteModal = false;
				await invalidateAll();
			}
		} catch (e) {
			// Handle error
		} finally {
			loading = false;
		}
	}

	async function handleCashCountSubmit(event: CustomEvent<{ configId: string; values: Record<string, number>; totalAmount: number; notes: string }>) {
		// Cash count was submitted successfully, now mark task as complete
		loading = true;
		try {
			const response = await fetch(`/tasks/${task.id}?/complete`, {
				method: 'POST',
				body: new FormData()
			});

			if (response.ok) {
				showCompleteModal = false;
				await invalidateAll(); // Refresh the page data
			} else {
				cashCountError = 'Cash count submitted but failed to mark task complete';
			}
		} catch (e) {
			cashCountError = 'Error completing task';
		} finally {
			loading = false;
		}
	}

	function handleCashCountCancel() {
		showCompleteModal = false;
	}

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
					{#if isAllStaffTask}
						<span class="font-medium text-primary-600">Assigned to: All Staff</span>
					{:else}
						<span>Assigned to: {task.assigneeName || 'Unassigned'}</span>
					{/if}
				</div>

				{#if isAllStaffTask}
					<div class="bg-primary-50 border border-primary-200 rounded-lg p-3">
						<div class="flex items-center justify-between mb-2">
							<span class="text-sm font-medium text-primary-700">Completion Progress</span>
							<span class="text-sm font-bold text-primary-700">{completionCount} / {totalStaff}</span>
						</div>
						<div class="w-full bg-primary-200 rounded-full h-2">
							<div
								class="bg-primary-600 h-2 rounded-full transition-all"
								style="width: {totalStaff > 0 ? (completionCount / totalStaff) * 100 : 0}%"
							></div>
						</div>
						{#if userHasCompleted}
							<p class="text-xs text-green-600 mt-2 flex items-center gap-1">
								<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
								</svg>
								You have completed this task
							</p>
						{/if}
					</div>
				{/if}

				<div class="flex flex-wrap gap-2 text-sm">
					{#if isCashCountTask}
						<span class="bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							Cash Count Task
						</span>
					{/if}
					{#if isSocialMediaTask}
						<span class="bg-purple-100 text-purple-700 px-2 py-1 rounded flex items-center gap-1">
							📱 Social Media Task
						</span>
					{/if}
					{#if task.photoRequired}
						<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded">Photo Required</span>
					{/if}
					{#if task.notesRequired && !isCashCountTask}
						<span class="bg-purple-100 text-purple-700 px-2 py-1 rounded">Notes Required</span>
					{/if}
				</div>

				{#if task.status !== 'completed' && task.status !== 'cancelled'}
					<div class="pt-4 border-t space-y-2">
						{#if isAllStaffTask}
							{#if !userHasCompleted}
								<button on:click={() => showCompleteModal = true} class="btn-primary w-full">
									Mark as Complete (Your Part)
								</button>
							{/if}
							{#if isManager}
								<form method="POST" action="?/forceComplete" use:enhance={({ cancel }) => {
									if (!confirm('This will mark the task as complete for everyone. Are you sure?')) {
										cancel();
										return;
									}
									loading = true;
									return async ({ update }) => {
										loading = false;
										await update();
									};
								}}>
									<button type="submit" disabled={loading} class="btn-secondary w-full">
										{loading ? 'Processing...' : 'Mark Complete for All Staff'}
									</button>
								</form>
							{/if}
						{:else}
							<button on:click={() => showCompleteModal = true} class="btn-primary w-full">
								Mark as Complete
							</button>
						{/if}
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

					<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
						if (!confirm('Are you sure you want to delete this task?')) {
							cancel();
						}
					}} class="mt-4 pt-4 border-t">
						<button type="submit" class="text-red-600 hover:text-red-700 text-sm">
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
		{#if isCashCountTask && cashCountConfig}
			<!-- Cash Count Task Completion -->
			<div class="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
				{#if cashCountError}
					<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-t-lg">
						{cashCountError}
					</div>
				{/if}
				<CashCountForm
					configId={cashCountConfig.configId}
					configName={cashCountConfig.configName || 'Cash Count'}
					fields={cashCountConfig.fields || []}
					locationId={cashCountConfig.locationId}
					disabled={loading}
					on:submit={handleCashCountSubmit}
					on:cancel={handleCashCountCancel}
				/>
			</div>
		{:else if isSocialMediaTask && socialMediaConfig}
			<!-- Social Media Task Completion -->
			<div class="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
				<SocialMediaMetricsForm
					configId={socialMediaConfig.configId}
					configName={socialMediaConfig.configName ?? 'Social Media Metrics'}
					platform={socialMediaConfig.platform ?? ''}
					fields={socialMediaConfig.fields ?? []}
					existingUrl={socialMediaConfig.postUrl}
					taskId={task.id}
					disabled={loading}
					on:submit={handleSocialMediaSubmit}
					on:cancel={() => showCompleteModal = false}
				/>
			</div>
		{:else}
			<!-- Regular Task Completion -->
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
		{/if}
	</div>
{/if}
