<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let loading = false;
	let taskType = 'template'; // 'template' or 'cash_count'
	let triggerType = '';
	let assignmentType = '';

	const roles = ['admin', 'manager', 'purchaser', 'staff'];
	const daysOfWeek = [
		{ value: 0, label: 'Sun' },
		{ value: 1, label: 'Mon' },
		{ value: 2, label: 'Tue' },
		{ value: 3, label: 'Wed' },
		{ value: 4, label: 'Thu' },
		{ value: 5, label: 'Fri' },
		{ value: 6, label: 'Sat' }
	];

	// Preset templates
	const presets = [
		{
			id: 'opening_till',
			name: 'Opening Till Count',
			description: 'Cash count when staff clocks in',
			icon: '💰',
			triggerType: 'clock_in',
			assignmentType: 'clocked_in_user',
			taskType: 'cash_count',
			defaults: {}
		},
		{
			id: 'closing_till',
			name: 'Closing Till Count',
			description: 'Cash count at closing time',
			icon: '🔒',
			triggerType: 'closing_shift',
			assignmentType: 'clocked_in_user',
			taskType: 'cash_count',
			defaults: { triggerTime: '17:00' }
		},
		{
			id: 'first_in_opening',
			name: 'First-In Opening Tasks',
			description: 'Tasks for first person at location',
			icon: '🔑',
			triggerType: 'first_clock_in',
			assignmentType: 'clocked_in_user',
			taskType: 'template',
			defaults: {}
		},
		{
			id: 'last_out_closing',
			name: 'Last-Out Closing Tasks',
			description: 'Tasks for last person at location',
			icon: '🚪',
			triggerType: 'last_clock_out',
			assignmentType: 'clocked_in_user',
			taskType: 'template',
			defaults: {}
		},
		{
			id: 'mid_shift',
			name: 'Mid-Shift Check',
			description: 'Task X hours into shift',
			icon: '⏰',
			triggerType: 'time_into_shift',
			assignmentType: 'clocked_in_user',
			taskType: 'template',
			defaults: { hoursIntoShift: '4' }
		},
		{
			id: 'daily_scheduled',
			name: 'Daily Scheduled Task',
			description: 'Recurring task at specific time',
			icon: '📅',
			triggerType: 'schedule',
			assignmentType: 'least_tasks',
			taskType: 'template',
			defaults: { cronExpression: '0 9 * * 1-5' }
		},
		{
			id: 'post_task',
			name: 'Post-Task Follow-Up',
			description: 'Chain task after another completes',
			icon: '🔗',
			triggerType: 'task_completed',
			assignmentType: 'clocked_in_user',
			taskType: 'template',
			defaults: {}
		}
	];

	let activePreset: string | null = null;
	let formElement: HTMLFormElement;

	function applyPreset(preset: typeof presets[0]) {
		activePreset = preset.id;
		taskType = preset.taskType;
		triggerType = preset.triggerType;
		assignmentType = preset.assignmentType;

		// Set name field
		requestAnimationFrame(() => {
			const nameInput = formElement?.querySelector<HTMLInputElement>('#name');
			if (nameInput && !nameInput.value) {
				nameInput.value = preset.name;
			}

			// Set defaults for trigger-specific fields
			if (preset.defaults.triggerTime) {
				const el = formElement?.querySelector<HTMLInputElement>('#triggerTime');
				if (el) el.value = preset.defaults.triggerTime;
			}
			if (preset.defaults.hoursIntoShift) {
				const el = formElement?.querySelector<HTMLInputElement>('#hoursIntoShift');
				if (el) el.value = preset.defaults.hoursIntoShift;
			}
			if (preset.defaults.cronExpression) {
				const el = formElement?.querySelector<HTMLInputElement>('#cronExpression');
				if (el) el.value = preset.defaults.cronExpression;
			}

			// Scroll to form
			formElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}

	function getTriggerBadgeColor(trigger: string): string {
		switch (trigger) {
			case 'clock_in': return 'bg-green-100 text-green-700';
			case 'clock_out': return 'bg-red-100 text-red-700';
			case 'first_clock_in': return 'bg-emerald-100 text-emerald-700';
			case 'last_clock_out': return 'bg-orange-100 text-orange-700';
			case 'closing_shift': return 'bg-purple-100 text-purple-700';
			case 'time_into_shift': return 'bg-blue-100 text-blue-700';
			case 'task_completed': return 'bg-indigo-100 text-indigo-700';
			case 'schedule': return 'bg-yellow-100 text-yellow-700';
			default: return 'bg-gray-100 text-gray-700';
		}
	}

	function getTriggerLabel(trigger: string): string {
		switch (trigger) {
			case 'clock_in': return 'Clock In';
			case 'clock_out': return 'Clock Out';
			case 'first_clock_in': return 'First Clock-In';
			case 'last_clock_out': return 'Last Clock-Out';
			case 'closing_shift': return 'Closing Shift';
			case 'time_into_shift': return 'Time Into Shift';
			case 'task_completed': return 'Task Completed';
			case 'schedule': return 'Schedule';
			default: return trigger;
		}
	}
</script>

<svelte:head>
	<title>New Assignment Rule - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<div class="mb-6">
		<nav class="text-sm text-gray-500 mb-2">
			<a href="/admin/tasks" class="hover:text-gray-700">Task Management</a>
			<span class="mx-2">/</span>
			<a href="/admin/tasks/rules" class="hover:text-gray-700">Rules</a>
			<span class="mx-2">/</span>
			<span>New</span>
		</nav>
		<h1 class="text-2xl font-bold text-gray-900">New Assignment Rule</h1>
		<p class="text-gray-600 mt-1">Configure automatic task creation and assignment</p>
	</div>

	<!-- Preset Templates -->
	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Start from Preset</h2>
		</div>
		<div class="card-body">
			<p class="text-sm text-gray-600 mb-4">
				Pick a common pattern to pre-fill the form, then customize as needed.
			</p>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{#each presets as preset}
					<button
						type="button"
						on:click={() => applyPreset(preset)}
						class="text-left p-3 rounded-lg border-2 transition-all hover:shadow-md {activePreset === preset.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}"
					>
						<div class="flex items-start gap-2">
							<span class="text-xl">{preset.icon}</span>
							<div class="flex-1 min-w-0">
								<p class="font-medium text-gray-900 text-sm">{preset.name}</p>
								<p class="text-xs text-gray-500 mt-0.5">{preset.description}</p>
								<span class="inline-block mt-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded {getTriggerBadgeColor(preset.triggerType)}">
									{getTriggerLabel(preset.triggerType)}
								</span>
							</div>
						</div>
					</button>
				{/each}
			</div>
			<p class="text-xs text-gray-400 mt-3 text-center">
				Or configure manually below
			</p>
		</div>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.error}
		</div>
	{/if}

	<form
		bind:this={formElement}
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
	>
		<!-- Basic Info -->
		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Basic Information</h2>
			</div>
			<div class="card-body space-y-4">
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700 mb-1">
						Rule Name <span class="text-red-500">*</span>
					</label>
					<input
						type="text"
						id="name"
						name="name"
						required
						class="input"
						placeholder="e.g., Opening Tasks on Clock-in"
					/>
				</div>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700 mb-1">
						Description
					</label>
					<textarea
						id="description"
						name="description"
						rows="2"
						class="input"
						placeholder="Optional description of what this rule does..."
					></textarea>
				</div>

				<!-- Task Type Selection -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-2">
						Task Type <span class="text-red-500">*</span>
					</label>
					<input type="hidden" name="taskType" value={taskType} />
					<div class="flex gap-4">
						<label class="flex items-center px-4 py-2 rounded-lg border cursor-pointer transition-colors {taskType === 'template' ? 'bg-primary-50 border-primary-500 text-primary-700' : 'bg-white border-gray-300 hover:bg-gray-50'}">
							<input
								type="radio"
								name="taskTypeRadio"
								value="template"
								bind:group={taskType}
								class="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
							/>
							<span class="ml-2 text-sm font-medium">Task Template</span>
						</label>
						<label class="flex items-center px-4 py-2 rounded-lg border cursor-pointer transition-colors {taskType === 'cash_count' ? 'bg-primary-50 border-primary-500 text-primary-700' : 'bg-white border-gray-300 hover:bg-gray-50'}">
							<input
								type="radio"
								name="taskTypeRadio"
								value="cash_count"
								bind:group={taskType}
								class="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
							/>
							<span class="ml-2 text-sm font-medium">Cash Count</span>
						</label>
					</div>
				</div>

				{#if taskType === 'template'}
					<div>
						<label for="templateId" class="block text-sm font-medium text-gray-700 mb-1">
							Task Template <span class="text-red-500">*</span>
						</label>
						<select id="templateId" name="templateId" required class="input">
							<option value="">Select a template...</option>
							{#each data.templates as template}
								<option value={template.id} selected={data.preselectedTemplateId === template.id}>
									{template.name}
								</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">Task will be created from this template</p>
					</div>
				{:else}
					<div>
						<label for="cashCountConfigId" class="block text-sm font-medium text-gray-700 mb-1">
							Cash Count Config <span class="text-red-500">*</span>
						</label>
						<select id="cashCountConfigId" name="cashCountConfigId" required class="input">
							<option value="">Select a cash count config...</option>
							{#each data.cashCountConfigs as config}
								<option value={config.id}>
									{config.name}{config.locationName ? ` - ${config.locationName}` : ''}
								</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">Creates a cash count task linked to this config</p>
					</div>
				{/if}

				<div>
					<label for="priority" class="block text-sm font-medium text-gray-700 mb-1">
						Priority
					</label>
					<input
						type="number"
						id="priority"
						name="priority"
						value="0"
						class="input"
						min="0"
						max="100"
					/>
					<p class="text-xs text-gray-500 mt-1">Higher priority rules are evaluated first (0-100)</p>
				</div>
			</div>
		</div>

		<!-- Trigger Configuration -->
		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Trigger</h2>
			</div>
			<div class="card-body space-y-4">
				<div>
					<label for="triggerType" class="block text-sm font-medium text-gray-700 mb-1">
						Trigger Type <span class="text-red-500">*</span>
					</label>
					<select
						id="triggerType"
						name="triggerType"
						required
						class="input"
						bind:value={triggerType}
					>
						<option value="">Select a trigger...</option>
						<option value="clock_in">Clock In</option>
						<option value="clock_out">Clock Out</option>
						<option value="first_clock_in">First Clock-In of Day</option>
						<option value="closing_shift">Closing Shift (time-based)</option>
						<option value="time_into_shift">Time Into Shift</option>
						<option value="task_completed">Task Completed</option>
						<option value="schedule">Scheduled (cron)</option>
					</select>
				</div>

				{#if triggerType === 'time_into_shift'}
					<div>
						<label for="hoursIntoShift" class="block text-sm font-medium text-gray-700 mb-1">
							Hours Into Shift <span class="text-red-500">*</span>
						</label>
						<input
							type="number"
							id="hoursIntoShift"
							name="hoursIntoShift"
							required
							step="0.5"
							min="0.5"
							class="input"
							placeholder="e.g., 2"
						/>
						<p class="text-xs text-gray-500 mt-1">Task will be created this many hours after clock-in</p>
					</div>
				{/if}

				{#if triggerType === 'task_completed'}
					<div>
						<label for="triggerTaskTemplateId" class="block text-sm font-medium text-gray-700 mb-1">
							When This Task is Completed <span class="text-red-500">*</span>
						</label>
						<select id="triggerTaskTemplateId" name="triggerTaskTemplateId" required class="input">
							<option value="">Select a template...</option>
							{#each data.templates as template}
								<option value={template.id}>{template.name}</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">New task will be created when a task from this template is completed</p>
					</div>
				{/if}

				{#if triggerType === 'schedule'}
					<div>
						<label for="cronExpression" class="block text-sm font-medium text-gray-700 mb-1">
							Cron Expression <span class="text-red-500">*</span>
						</label>
						<input
							type="text"
							id="cronExpression"
							name="cronExpression"
							required
							class="input font-mono"
							placeholder="0 9 * * 1-5"
						/>
						<p class="text-xs text-gray-500 mt-1">
							Format: minute hour day month weekday (e.g., "0 9 * * 1-5" for 9am Mon-Fri)
						</p>
					</div>
				{/if}

				{#if triggerType === 'closing_shift'}
					<div>
						<label for="triggerTime" class="block text-sm font-medium text-gray-700 mb-1">
							Trigger Time <span class="text-red-500">*</span>
						</label>
						<input
							type="time"
							id="triggerTime"
							name="triggerTime"
							required
							class="input"
						/>
						<p class="text-xs text-gray-500 mt-1">
							Task will be assigned to all clocked-in users at this time (Pacific timezone)
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Conditions -->
		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Conditions (Optional)</h2>
			</div>
			<div class="card-body space-y-4">
				<p class="text-sm text-gray-600">
					Only create task when all selected conditions are met. Leave empty to always trigger.
				</p>

				<div>
					<label for="conditionLocationId" class="block text-sm font-medium text-gray-700 mb-1">
						Location
					</label>
					<select id="conditionLocationId" name="conditionLocationId" class="input">
						<option value="">Any Location</option>
						{#each data.locations as location}
							<option value={location.id}>{location.name}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-2">
						User Roles
					</label>
					<div class="flex flex-wrap gap-4">
						{#each roles as role}
							<label class="flex items-center">
								<input
									type="checkbox"
									name="conditionRoles"
									value={role}
									class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
								/>
								<span class="ml-2 text-sm text-gray-700 capitalize">{role}</span>
							</label>
						{/each}
					</div>
					<p class="text-xs text-gray-500 mt-1">Only trigger for users with these roles</p>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-2">
						Days of Week
					</label>
					<div class="flex flex-wrap gap-2">
						{#each daysOfWeek as day}
							<label class="flex items-center px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
								<input
									type="checkbox"
									name="conditionDaysOfWeek"
									value={day.value}
									class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
								/>
								<span class="ml-2 text-sm text-gray-700">{day.label}</span>
							</label>
						{/each}
					</div>
					<p class="text-xs text-gray-500 mt-1">Leave empty for all days</p>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="conditionTimeWindowStart" class="block text-sm font-medium text-gray-700 mb-1">
							Time Window Start
						</label>
						<input
							type="time"
							id="conditionTimeWindowStart"
							name="conditionTimeWindowStart"
							class="input"
						/>
					</div>
					<div>
						<label for="conditionTimeWindowEnd" class="block text-sm font-medium text-gray-700 mb-1">
							Time Window End
						</label>
						<input
							type="time"
							id="conditionTimeWindowEnd"
							name="conditionTimeWindowEnd"
							class="input"
						/>
					</div>
				</div>
				<p class="text-xs text-gray-500">Only trigger during this time window</p>
			</div>
		</div>

		<!-- Assignment Configuration -->
		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Assignment</h2>
			</div>
			<div class="card-body space-y-4">
				<div>
					<label for="assignmentType" class="block text-sm font-medium text-gray-700 mb-1">
						Assignment Method <span class="text-red-500">*</span>
					</label>
					<select
						id="assignmentType"
						name="assignmentType"
						required
						class="input"
						bind:value={assignmentType}
					>
						<option value="">Select an assignment method...</option>
						<option value="clocked_in_user">Triggering User (who caused the trigger)</option>
						<option value="specific_user">Specific User</option>
						<option value="role_rotation">Role Rotation (round-robin)</option>
						<option value="location_staff">Any Location Staff</option>
						<option value="least_tasks">User with Least Tasks</option>
					</select>
				</div>

				{#if assignmentType === 'specific_user'}
					<div>
						<label for="assignmentUserId" class="block text-sm font-medium text-gray-700 mb-1">
							Assign To <span class="text-red-500">*</span>
						</label>
						<select id="assignmentUserId" name="assignmentUserId" required class="input">
							<option value="">Select a user...</option>
							{#each data.users as user}
								<option value={user.id}>{user.name} ({user.role})</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if assignmentType === 'role_rotation' || assignmentType === 'location_staff' || assignmentType === 'least_tasks'}
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">
							From Roles
						</label>
						<div class="flex flex-wrap gap-4">
							{#each roles as role}
								<label class="flex items-center">
									<input
										type="checkbox"
										name="assignmentRoles"
										value={role}
										class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
									/>
									<span class="ml-2 text-sm text-gray-700 capitalize">{role}</span>
								</label>
							{/each}
						</div>
						<p class="text-xs text-gray-500 mt-1">
							{assignmentType === 'role_rotation'
								? 'Rotate assignment among users with these roles'
								: assignmentType === 'least_tasks'
									? 'Choose user with least tasks from these roles'
									: 'Assign to any available staff from these roles'}
						</p>
					</div>
				{/if}
			</div>
		</div>

		<div class="flex justify-end gap-3">
			<a href="/admin/tasks/rules" class="btn btn-secondary">Cancel</a>
			<button type="submit" disabled={loading} class="btn btn-primary">
				{#if loading}
					<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Creating...
				{:else}
					Create Rule
				{/if}
			</button>
		</div>
	</form>
</div>
