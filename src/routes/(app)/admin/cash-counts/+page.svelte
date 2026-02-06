<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	// Modal state
	let showCreateModal = false;
	let creating = false;
	let error = '';

	// Auto setup state
	let showAutoSetup = false;
	let selectedAutoConfigId = '';

	// New config form
	let newConfig = {
		locationId: '',
		name: '',
		triggerType: 'manual' as 'shift_start' | 'shift_end' | 'manual',
		fields: [
			{ name: 'hundreds', label: '$100 Bills', type: 'integer' as const, multiplier: 100, required: false, order: 1 },
			{ name: 'fifties', label: '$50 Bills', type: 'integer' as const, multiplier: 50, required: false, order: 2 },
			{ name: 'twenties', label: '$20 Bills', type: 'integer' as const, multiplier: 20, required: false, order: 3 },
			{ name: 'tens', label: '$10 Bills', type: 'integer' as const, multiplier: 10, required: false, order: 4 },
			{ name: 'fives', label: '$5 Bills', type: 'integer' as const, multiplier: 5, required: false, order: 5 },
			{ name: 'ones', label: '$1 Bills', type: 'integer' as const, multiplier: 1, required: false, order: 6 },
			{ name: 'quarters', label: 'Quarters', type: 'integer' as const, multiplier: 0.25, required: false, order: 7 },
			{ name: 'dimes', label: 'Dimes', type: 'integer' as const, multiplier: 0.10, required: false, order: 8 },
			{ name: 'nickels', label: 'Nickels', type: 'integer' as const, multiplier: 0.05, required: false, order: 9 },
			{ name: 'pennies', label: 'Pennies', type: 'integer' as const, multiplier: 0.01, required: false, order: 10 }
		]
	};

	$: activeConfigs = data.configs.filter((c) => c.isActive);
	$: configLookup = Object.fromEntries(data.configs.map((c) => [c.id, c.name]));

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatCurrency(amount: string | number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(typeof amount === 'string' ? parseFloat(amount) : amount);
	}

	function getTriggerLabel(trigger: string) {
		switch (trigger) {
			case 'shift_start': return 'Shift Start';
			case 'shift_end': return 'Shift End';
			case 'manual': return 'Manual';
			default: return trigger;
		}
	}

	function openCreateModal() {
		error = '';
		newConfig.locationId = data.locations[0]?.id || '';
		newConfig.name = '';
		newConfig.triggerType = 'manual';
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	async function createConfig() {
		if (!newConfig.locationId || !newConfig.name.trim()) {
			error = 'Location and name are required';
			return;
		}

		creating = true;
		error = '';

		try {
			const response = await fetch('/api/cash-count-configs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					locationId: newConfig.locationId,
					name: newConfig.name.trim(),
					triggerType: newConfig.triggerType,
					fields: newConfig.fields.filter(f => f.name && f.label)
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to create config');
			}

			closeCreateModal();
			invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create config';
		} finally {
			creating = false;
		}
	}

	async function toggleConfigActive(configId: string, currentActive: boolean) {
		try {
			const response = await fetch(`/api/cash-count-configs/${configId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isActive: !currentActive })
			});

			if (response.ok) {
				invalidateAll();
			}
		} catch (e) {
			console.error('Failed to toggle config:', e);
		}
	}
</script>

<svelte:head>
	<title>Cash Count Management - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold">Cash Count Management</h1>
			<p class="text-gray-600 mt-1">Configure and view cash count procedures</p>
		</div>
		<button on:click={openCreateModal} class="btn-primary">
			<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Config
		</button>
	</div>

	<!-- Auto Till Count Setup Section -->
	<div class="card mb-6 border-2 border-primary-200 bg-primary-50/30">
		<div class="card-body">
			<div class="flex items-start justify-between">
				<div class="flex items-start gap-3">
					<div class="p-2 rounded-lg bg-primary-100">
						<svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<div>
						<h2 class="text-lg font-semibold text-gray-900">Auto Till Count at Clock-In</h2>
						<p class="text-sm text-gray-600 mt-1">
							Automatically assign a cash count task when staff clocks in. This uses the existing task assignment system.
						</p>
					</div>
				</div>
				{#if !showAutoSetup}
					<button
						on:click={() => { showAutoSetup = true; selectedAutoConfigId = activeConfigs[0]?.id || ''; }}
						class="btn-primary text-sm"
						disabled={activeConfigs.length === 0}
					>
						Setup Auto Till Count
					</button>
				{/if}
			</div>

			{#if activeConfigs.length === 0 && !showAutoSetup}
				<p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
					Create an active cash count config first before setting up auto-assignment.
				</p>
			{/if}

			{#if showAutoSetup}
				<form method="POST" action="?/setupAutoCount" use:enhance={() => {
					return async ({ update }) => {
						await update();
						showAutoSetup = false;
					};
				}} class="mt-4 p-4 bg-white rounded-lg border border-gray-200">
					<h3 class="font-medium text-gray-900 mb-3">Quick Setup</h3>

					{#if form?.error}
						<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-3">
							{form.error}
						</div>
					{/if}

					<div class="mb-4">
						<label for="autoConfigSelect" class="block text-sm font-medium text-gray-700 mb-1">
							Cash Count Config
						</label>
						<select
							id="autoConfigSelect"
							name="cashCountConfigId"
							bind:value={selectedAutoConfigId}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							required
						>
							{#each activeConfigs as config}
								<option value={config.id}>{config.name}{config.locationName ? ` (${config.locationName})` : ''}</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">
							When any staff member clocks in, they'll receive a cash count task using this config.
						</p>
					</div>

					<div class="flex gap-3">
						<button type="button" on:click={() => showAutoSetup = false} class="btn-secondary text-sm">
							Cancel
						</button>
						<button type="submit" class="btn-primary text-sm">
							Create Auto-Assignment Rule
						</button>
					</div>
				</form>
			{/if}

			{#if form?.success}
				<div class="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
					Auto till count rule created successfully.
				</div>
			{/if}

			<!-- Existing auto-assignment rules -->
			{#if data.autoRules.length > 0}
				<div class="mt-4">
					<h3 class="text-sm font-medium text-gray-700 mb-2">Active Auto-Assignment Rules</h3>
					<div class="space-y-2">
						{#each data.autoRules as rule}
							<div class="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
								<div class="flex items-center gap-3">
									<span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full {rule.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
										{rule.isActive ? 'Active' : 'Inactive'}
									</span>
									<div>
										<p class="text-sm font-medium text-gray-900">{rule.name}</p>
										<p class="text-xs text-gray-500">
											Config: {configLookup[rule.cashCountConfigId || ''] || 'Unknown'}
											{#if rule.triggerCount > 0}
												&middot; Triggered {rule.triggerCount} time{rule.triggerCount !== 1 ? 's' : ''}
											{/if}
											{#if rule.lastTriggeredAt}
												&middot; Last: {formatDate(rule.lastTriggeredAt)}
											{/if}
										</p>
									</div>
								</div>
								<div class="flex items-center gap-2">
									<form method="POST" action="?/toggleAutoRule" use:enhance>
										<input type="hidden" name="ruleId" value={rule.id} />
										<button type="submit" class="text-sm text-primary-600 hover:text-primary-700">
											{rule.isActive ? 'Disable' : 'Enable'}
										</button>
									</form>
									<form method="POST" action="?/deleteAutoRule" use:enhance>
										<input type="hidden" name="ruleId" value={rule.id} />
										<button type="submit" class="text-sm text-red-600 hover:text-red-700">
											Delete
										</button>
									</form>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Configurations -->
	<div class="card mb-6">
		<div class="card-body">
			<h2 class="text-lg font-semibold mb-4">Cash Count Configurations</h2>
			{#if data.configs.length === 0}
				<p class="text-gray-500 text-center py-8">No configurations yet. Create one to get started.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b text-left">
								<th class="pb-3 font-medium">Name</th>
								<th class="pb-3 font-medium">Location</th>
								<th class="pb-3 font-medium">Trigger</th>
								<th class="pb-3 font-medium">Fields</th>
								<th class="pb-3 font-medium">Status</th>
								<th class="pb-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each data.configs as config}
								<tr class="border-b">
									<td class="py-3">{config.name}</td>
									<td class="py-3">{config.locationName || 'Unknown'}</td>
									<td class="py-3">
										<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
											{getTriggerLabel(config.triggerType)}
										</span>
									</td>
									<td class="py-3 text-sm text-gray-600">
										{Array.isArray(config.fields) ? config.fields.length : 0} fields
									</td>
									<td class="py-3">
										<span class="px-2 py-0.5 text-xs font-medium rounded-full {config.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
											{config.isActive ? 'Active' : 'Inactive'}
										</span>
									</td>
									<td class="py-3">
										<button
											on:click={() => toggleConfigActive(config.id, config.isActive)}
											class="text-sm text-primary-600 hover:text-primary-700"
										>
											{config.isActive ? 'Deactivate' : 'Activate'}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>

	<!-- Recent Counts -->
	<div class="card">
		<div class="card-body">
			<h2 class="text-lg font-semibold mb-4">Recent Cash Counts</h2>
			{#if data.recentCounts.length === 0}
				<p class="text-gray-500 text-center py-8">No cash counts submitted yet.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b text-left">
								<th class="pb-3 font-medium">Date</th>
								<th class="pb-3 font-medium">Submitted By</th>
								<th class="pb-3 font-medium">Location</th>
								<th class="pb-3 font-medium">Total</th>
							</tr>
						</thead>
						<tbody>
							{#each data.recentCounts as count}
								<tr class="border-b">
									<td class="py-3">{formatDate(count.submittedAt)}</td>
									<td class="py-3">{count.userName || 'Unknown'}</td>
									<td class="py-3">{count.locationName || 'Unknown'}</td>
									<td class="py-3 font-medium">{formatCurrency(count.totalAmount)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Create Config Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
		<div class="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
			<div class="p-6">
				<div class="flex items-start justify-between mb-4">
					<h2 class="text-lg font-semibold">Create Cash Count Config</h2>
					<button on:click={closeCreateModal} class="text-gray-400 hover:text-gray-600">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{#if error}
					<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
						{error}
					</div>
				{/if}

				<form on:submit|preventDefault={createConfig} class="space-y-4">
					<div>
						<label for="name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
						<input
							id="name"
							type="text"
							bind:value={newConfig.name}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							placeholder="e.g., Opening Count, Closing Count"
							required
						/>
					</div>

					<div>
						<label for="location" class="block text-sm font-medium text-gray-700 mb-1">Location *</label>
						<select
							id="location"
							bind:value={newConfig.locationId}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							required
						>
							{#each data.locations as location}
								<option value={location.id}>{location.name}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="trigger" class="block text-sm font-medium text-gray-700 mb-1">Trigger</label>
						<select
							id="trigger"
							bind:value={newConfig.triggerType}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
						>
							<option value="manual">Manual</option>
							<option value="shift_start">Shift Start</option>
							<option value="shift_end">Shift End</option>
						</select>
						<p class="text-xs text-gray-500 mt-1">
							When set to Shift Start/End, staff will be prompted to complete this count.
						</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">Fields</label>
						<p class="text-xs text-gray-500 mb-2">
							Default fields for counting US currency. You can modify these after creation.
						</p>
						<div class="bg-gray-50 rounded-lg p-3 text-sm">
							{#each newConfig.fields as field}
								<div class="flex justify-between py-1">
									<span>{field.label}</span>
									<span class="text-gray-500">x{field.multiplier}</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="flex gap-3 pt-2">
						<button type="button" on:click={closeCreateModal} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={creating} class="btn-primary flex-1">
							{#if creating}
								<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
								Creating...
							{:else}
								Create Config
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
