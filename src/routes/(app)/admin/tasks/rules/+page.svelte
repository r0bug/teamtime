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
		last_clock_out: 'Last Clock-Out',
		closing_shift: 'Closing Shift',
		time_into_shift: 'Time Into Shift',
		task_completed: 'Task Completed',
		schedule: 'Scheduled'
	};

	const assignmentTypeLabels: Record<string, string> = {
		specific_user: 'Specific User',
		clocked_in_user: 'Triggering User',
		role_rotation: 'Role Rotation',
		location_staff: 'Location Staff',
		least_tasks: 'Least Tasks'
	};

	function formatDate(date: Date | string | null): string {
		if (!date) return 'Never';
		const d = new Date(date);
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getTriggerDescription(rule: typeof data.rules[0]): string {
		const config = rule.triggerConfig;
		switch (rule.triggerType) {
			case 'time_into_shift':
				return `${config?.hoursIntoShift || '?'} hours into shift`;
			case 'schedule':
				return config?.cronExpression || 'Scheduled';
			case 'task_completed':
				return 'On task completion';
			default:
				return triggerTypeLabels[rule.triggerType] || rule.triggerType;
		}
	}
</script>

<svelte:head>
	<title>Assignment Rules - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
		<div>
			<nav class="text-sm text-gray-500 mb-2">
				<a href="/admin/tasks" class="hover:text-gray-700">Task Management</a>
				<span class="mx-2">/</span>
				<span>Rules</span>
			</nav>
			<h1 class="text-2xl font-bold text-gray-900">Assignment Rules</h1>
			<p class="text-gray-600 mt-1">
				{#if data.filterTemplateName}
					Rules for template: <strong>{data.filterTemplateName}</strong>
					<a href="/admin/tasks/rules" class="text-primary-600 hover:text-primary-700 ml-2">Clear filter</a>
				{:else}
					Configure automatic task creation and assignment
				{/if}
			</p>
		</div>
		<a
			href="/admin/tasks/rules/new{data.filterTemplateId ? `?templateId=${data.filterTemplateId}` : ''}"
			class="btn btn-primary"
		>
			<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Rule
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

	<!-- Filter by Template -->
	{#if !data.filterTemplateId && data.templates.length > 0}
		<div class="mb-4">
			<select
				class="input max-w-xs"
				on:change={(e) => {
					const value = e.currentTarget.value;
					if (value) {
						window.location.href = `/admin/tasks/rules?templateId=${value}`;
					}
				}}
			>
				<option value="">Filter by template...</option>
				{#each data.templates as template}
					<option value={template.id}>{template.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if data.rules.length > 0}
		<div class="card">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rule</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trigger</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Type</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignment</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stats</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.rules as rule}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3">
									<div class="font-medium text-gray-900">{rule.name}</div>
									{#if rule.description}
										<div class="text-sm text-gray-500 truncate max-w-xs">{rule.description}</div>
									{/if}
									<div class="text-xs text-gray-400">Priority: {rule.priority}</div>
								</td>
								<td class="px-4 py-3">
									<span class="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
										{triggerTypeLabels[rule.triggerType] || rule.triggerType}
									</span>
									{#if rule.triggerType === 'time_into_shift' && rule.triggerConfig?.hoursIntoShift}
										<div class="text-xs text-gray-500 mt-1">
											{rule.triggerConfig.hoursIntoShift}h into shift
										</div>
									{/if}
									{#if rule.triggerType === 'schedule' && rule.triggerConfig?.cronExpression}
										<div class="text-xs text-gray-500 mt-1 font-mono">
											{rule.triggerConfig.cronExpression}
										</div>
									{/if}
									{#if rule.triggerType === 'closing_shift' && rule.triggerConfig?.triggerTime}
										<div class="text-xs text-gray-500 mt-1">
											@ {rule.triggerConfig.triggerTime}
										</div>
									{/if}
								</td>
								<td class="px-4 py-3">
									{#if rule.cashCountConfigId}
										<div class="flex items-center gap-1">
											<span class="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">Cash Count</span>
											<span class="text-sm text-gray-900">{rule.cashCountConfigName || 'Unknown'}</span>
										</div>
									{:else if rule.templateId}
										<a href="/admin/tasks/templates/{rule.templateId}" class="text-primary-600 hover:text-primary-700">
											{rule.templateName}
										</a>
									{:else}
										<span class="text-gray-400">—</span>
									{/if}
								</td>
								<td class="px-4 py-3">
									<span class="text-sm text-gray-600">
										{assignmentTypeLabels[rule.assignmentType] || rule.assignmentType}
									</span>
								</td>
								<td class="px-4 py-3">
									<div class="text-sm text-gray-600">
										{rule.triggerCount} triggered
									</div>
									<div class="text-xs text-gray-400">
										Last: {formatDate(rule.lastTriggeredAt)}
									</div>
								</td>
								<td class="px-4 py-3">
									<form
										method="POST"
										action="?/toggleActive"
										use:enhance={() => {
											loading = rule.id;
											return async ({ update }) => {
												loading = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="ruleId" value={rule.id} />
										<input type="hidden" name="isActive" value={!rule.isActive} />
										<button
											type="submit"
											disabled={loading === rule.id}
											class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 {rule.isActive ? 'bg-primary-600' : 'bg-gray-200'}"
										>
											<span
												class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {rule.isActive ? 'translate-x-5' : 'translate-x-0'}"
											></span>
										</button>
									</form>
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex justify-end gap-2">
										<a
											href="/admin/tasks/rules/{rule.id}"
											class="text-gray-600 hover:text-gray-900"
											title="Edit"
										>
											<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
											</svg>
										</a>
										{#if deleteConfirm === rule.id}
											<form
												method="POST"
												action="?/delete"
												use:enhance={() => {
													loading = `delete-${rule.id}`;
													return async ({ update }) => {
														loading = null;
														deleteConfirm = null;
														await update();
													};
												}}
											>
												<input type="hidden" name="ruleId" value={rule.id} />
												<button
													type="submit"
													disabled={loading === `delete-${rule.id}`}
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
												on:click={() => (deleteConfirm = rule.id)}
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
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No rules yet</h3>
				<p class="text-gray-600 mb-4">
					{#if data.filterTemplateId}
						No rules exist for this template. Create one to automate task assignment.
					{:else}
						Create assignment rules to automatically create and assign tasks based on triggers.
					{/if}
				</p>
				<a
					href="/admin/tasks/rules/new{data.filterTemplateId ? `?templateId=${data.filterTemplateId}` : ''}"
					class="btn btn-primary"
				>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Create Rule
				</a>
			</div>
		</div>
	{/if}

	<!-- Help Section -->
	<div class="mt-8 card">
		<div class="card-header">
			<h2 class="font-semibold">Trigger Types</h2>
		</div>
		<div class="card-body">
			<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
				<div>
					<h4 class="font-medium text-gray-900">Clock In</h4>
					<p class="text-gray-600">Fires when any user clocks in</p>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">Clock Out</h4>
					<p class="text-gray-600">Fires when any user clocks out</p>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">First Clock-In</h4>
					<p class="text-gray-600">Fires for the first person to clock in at a location</p>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">Closing Shift</h4>
					<p class="text-gray-600">Fires at a specific time for all clocked-in users (e.g., closing tasks)</p>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">Time Into Shift</h4>
					<p class="text-gray-600">Fires X hours after a user clocks in</p>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">Task Completed</h4>
					<p class="text-gray-600">Fires when a specific task template is completed</p>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">Scheduled (cron)</h4>
					<p class="text-gray-600">Fires at specific times using cron expressions</p>
				</div>
			</div>
		</div>
	</div>
</div>
