<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let loading = false;
	let steps: { step: number; title: string; description?: string }[] = [];
	let newStepTitle = '';
	let newStepDescription = '';

	function addStep() {
		if (!newStepTitle.trim()) return;
		steps = [
			...steps,
			{
				step: steps.length + 1,
				title: newStepTitle.trim(),
				description: newStepDescription.trim() || undefined
			}
		];
		newStepTitle = '';
		newStepDescription = '';
	}

	function removeStep(index: number) {
		steps = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i + 1 }));
	}

	function moveStep(index: number, direction: 'up' | 'down') {
		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= steps.length) return;
		const newSteps = [...steps];
		[newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
		steps = newSteps.map((s, i) => ({ ...s, step: i + 1 }));
	}
</script>

<svelte:head>
	<title>New Task Template - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<div class="mb-6">
		<nav class="text-sm text-gray-500 mb-2">
			<a href="/admin/tasks" class="hover:text-gray-700">Task Management</a>
			<span class="mx-2">/</span>
			<a href="/admin/tasks/templates" class="hover:text-gray-700">Templates</a>
			<span class="mx-2">/</span>
			<span>New</span>
		</nav>
		<h1 class="text-2xl font-bold text-gray-900">New Task Template</h1>
		<p class="text-gray-600 mt-1">Create a reusable task definition</p>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
	>
		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Basic Information</h2>
			</div>
			<div class="card-body space-y-4">
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700 mb-1">
						Template Name <span class="text-red-500">*</span>
					</label>
					<input
						type="text"
						id="name"
						name="name"
						required
						class="input"
						placeholder="e.g., Opening Tasks, Cash Count, Store Walkthrough"
					/>
				</div>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700 mb-1">
						Description
					</label>
					<textarea
						id="description"
						name="description"
						rows="3"
						class="input"
						placeholder="Describe what this task involves..."
					></textarea>
				</div>

				<div>
					<label for="locationId" class="block text-sm font-medium text-gray-700 mb-1">
						Location
					</label>
					<select id="locationId" name="locationId" class="input">
						<option value="">All Locations</option>
						{#each data.locations as location}
							<option value={location.id}>{location.name}</option>
						{/each}
					</select>
					<p class="text-xs text-gray-500 mt-1">Leave empty to apply to all locations</p>
				</div>
			</div>
		</div>

		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Requirements</h2>
			</div>
			<div class="card-body space-y-4">
				<label class="flex items-center">
					<input
						type="checkbox"
						name="photoRequired"
						class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
					/>
					<span class="ml-2 text-sm text-gray-700">Photo required for completion</span>
				</label>

				<label class="flex items-center">
					<input
						type="checkbox"
						name="notesRequired"
						class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
					/>
					<span class="ml-2 text-sm text-gray-700">Notes required for completion</span>
				</label>
			</div>
		</div>

		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Legacy Trigger (Optional)</h2>
			</div>
			<div class="card-body space-y-4">
				<p class="text-sm text-gray-600">
					For simple clock-based triggers. Use Assignment Rules for more advanced automation.
				</p>

				<div>
					<label for="triggerEvent" class="block text-sm font-medium text-gray-700 mb-1">
						Trigger Event
					</label>
					<select id="triggerEvent" name="triggerEvent" class="input">
						<option value="">None (Manual or Rule-based)</option>
						<option value="clock_in">Clock In</option>
						<option value="clock_out">Clock Out</option>
						<option value="first_clock_in">First Clock-In of Day</option>
						<option value="last_clock_out">Last Clock-Out of Day</option>
					</select>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="timeWindowStart" class="block text-sm font-medium text-gray-700 mb-1">
							Time Window Start
						</label>
						<input
							type="time"
							id="timeWindowStart"
							name="timeWindowStart"
							class="input"
						/>
					</div>
					<div>
						<label for="timeWindowEnd" class="block text-sm font-medium text-gray-700 mb-1">
							Time Window End
						</label>
						<input
							type="time"
							id="timeWindowEnd"
							name="timeWindowEnd"
							class="input"
						/>
					</div>
				</div>
			</div>
		</div>

		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Steps (Optional)</h2>
			</div>
			<div class="card-body">
				{#if steps.length > 0}
					<div class="space-y-2 mb-4">
						{#each steps as step, index}
							<div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
								<div class="flex flex-col gap-1">
									<button
										type="button"
										class="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
										disabled={index === 0}
										on:click={() => moveStep(index, 'up')}
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
										</svg>
									</button>
									<button
										type="button"
										class="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
										disabled={index === steps.length - 1}
										on:click={() => moveStep(index, 'down')}
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
										</svg>
									</button>
								</div>
								<div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-medium text-sm">
									{step.step}
								</div>
								<div class="flex-1">
									<div class="font-medium text-gray-900">{step.title}</div>
									{#if step.description}
										<div class="text-sm text-gray-500">{step.description}</div>
									{/if}
								</div>
								<button
									type="button"
									class="p-1 text-gray-400 hover:text-red-600"
									on:click={() => removeStep(index)}
								>
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{/if}

				<div class="space-y-3">
					<input
						type="text"
						bind:value={newStepTitle}
						placeholder="Step title"
						class="input"
						on:keypress={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
					/>
					<input
						type="text"
						bind:value={newStepDescription}
						placeholder="Step description (optional)"
						class="input"
						on:keypress={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
					/>
					<button
						type="button"
						class="btn btn-secondary w-full"
						on:click={addStep}
					>
						<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
						Add Step
					</button>
				</div>

				<input type="hidden" name="steps" value={JSON.stringify(steps.length > 0 ? steps : null)} />
			</div>
		</div>

		<div class="flex justify-end gap-3">
			<a href="/admin/tasks/templates" class="btn btn-secondary">Cancel</a>
			<button type="submit" disabled={loading} class="btn btn-primary">
				{#if loading}
					<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Creating...
				{:else}
					Create Template
				{/if}
			</button>
		</div>
	</form>
</div>
