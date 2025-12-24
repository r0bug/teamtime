<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let loading = false;
	let assignmentType: 'individual' | 'all_staff' = 'individual';
</script>

<svelte:head>
	<title>New Task - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/tasks" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">Create New Task</h1>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		<div class="card">
			<div class="card-body">
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-6"
				>
					<div>
						<label for="title" class="label">Task Title *</label>
						<input
							type="text"
							id="title"
							name="title"
							required
							class="input"
							placeholder="Enter task title"
						/>
					</div>

					<div>
						<label for="description" class="label">Description</label>
						<textarea
							id="description"
							name="description"
							rows="3"
							class="input"
							placeholder="Describe what needs to be done..."
						></textarea>
					</div>

						<!-- Assignment Type -->
					<div>
						<label class="label">Assignment Type</label>
						<input type="hidden" name="assignmentType" value={assignmentType} />
						<div class="flex gap-4 mt-2">
							<label class="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition-colors {assignmentType === 'individual' ? 'bg-primary-50 border-primary-500' : 'bg-white border-gray-300 hover:bg-gray-50'}">
								<input
									type="radio"
									name="assignmentTypeRadio"
									value="individual"
									bind:group={assignmentType}
									class="w-4 h-4 text-primary-600"
								/>
								<span class="text-sm font-medium">Specific User</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition-colors {assignmentType === 'all_staff' ? 'bg-primary-50 border-primary-500' : 'bg-white border-gray-300 hover:bg-gray-50'}">
								<input
									type="radio"
									name="assignmentTypeRadio"
									value="all_staff"
									bind:group={assignmentType}
									class="w-4 h-4 text-primary-600"
								/>
								<span class="text-sm font-medium">All Staff</span>
							</label>
						</div>
						{#if assignmentType === 'all_staff'}
							<p class="text-xs text-gray-500 mt-2">Task will appear on all staff members' task lists until completed</p>
						{/if}
					</div>

					<div class="grid gap-6 lg:grid-cols-2">
						{#if assignmentType === 'individual'}
							<div>
								<label for="assignedTo" class="label">Assign To</label>
								<select id="assignedTo" name="assignedTo" class="input">
									<option value="">Unassigned</option>
									{#each data.users as user}
										<option value={user.id}>{user.name} ({user.role})</option>
									{/each}
								</select>
							</div>
						{/if}

						<div>
							<label for="priority" class="label">Priority</label>
							<select id="priority" name="priority" class="input">
								<option value="low">Low</option>
								<option value="medium" selected>Medium</option>
								<option value="high">High</option>
								<option value="urgent">Urgent</option>
							</select>
						</div>

						<div>
							<label for="dueAt" class="label">Due Date</label>
							<input type="datetime-local" id="dueAt" name="dueAt" class="input" />
						</div>
					</div>

					<div class="space-y-3">
						<label class="flex items-center gap-3">
							<input type="checkbox" name="photoRequired" class="w-5 h-5 rounded border-gray-300" />
							<span>Require photo for completion</span>
						</label>
						<label class="flex items-center gap-3">
							<input type="checkbox" name="notesRequired" class="w-5 h-5 rounded border-gray-300" />
							<span>Require notes for completion</span>
						</label>
					</div>

					<div class="flex gap-4 pt-4">
						<a href="/tasks" class="btn-ghost flex-1 text-center">Cancel</a>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{#if loading}
								Creating...
							{:else}
								Create Task
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
