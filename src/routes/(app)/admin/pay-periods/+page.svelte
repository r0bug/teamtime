<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let config = { ...data.config };
	let loading = false;

	// Generate day options 1-31
	const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatShortDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Pay Periods - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Pay Period Settings</h1>
		<p class="text-gray-600 mt-1">Configure your pay period schedule for reports</p>
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

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Configuration Form -->
		<div class="card p-6">
			<h2 class="text-lg font-semibold mb-4">Pay Period Configuration</h2>

			<form method="POST" action="?/save" use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}} class="space-y-6">
				<!-- Pay Period Type -->
				<div>
					<label for="type" class="label">Pay Schedule Type</label>
					<select id="type" name="type" bind:value={config.type} class="input">
						<option value="semi-monthly">Semi-Monthly (2x per month)</option>
						<option value="bi-weekly" disabled>Bi-Weekly (every 2 weeks) - Coming Soon</option>
						<option value="weekly" disabled>Weekly - Coming Soon</option>
						<option value="monthly" disabled>Monthly - Coming Soon</option>
					</select>
				</div>

				{#if config.type === 'semi-monthly'}
					<!-- Period 1 Configuration -->
					<div class="bg-blue-50 rounded-lg p-4">
						<h3 class="font-medium text-blue-900 mb-3">Pay Period 1 (crosses month)</h3>
						<p class="text-sm text-blue-700 mb-3">For periods that span two months (e.g., 26th to 10th)</p>

						<div class="grid grid-cols-3 gap-3">
							<div>
								<label for="period1Start" class="label text-sm">Start Day</label>
								<select id="period1Start" name="period1Start" bind:value={config.period1Start} class="input">
									{#each dayOptions as day}
										<option value={day}>{day}</option>
									{/each}
								</select>
							</div>
							<div>
								<label for="period1End" class="label text-sm">End Day</label>
								<select id="period1End" name="period1End" bind:value={config.period1End} class="input">
									{#each dayOptions as day}
										<option value={day}>{day}</option>
									{/each}
								</select>
							</div>
							<div>
								<label for="period1Payday" class="label text-sm">Payday</label>
								<select id="period1Payday" name="period1Payday" bind:value={config.period1Payday} class="input">
									{#each dayOptions as day}
										<option value={day}>{day}</option>
									{/each}
								</select>
							</div>
						</div>
						<p class="text-xs text-blue-600 mt-2">
							Example: {config.period1Start}th - {config.period1End}th, paid on the {config.period1Payday}st
						</p>
					</div>

					<!-- Period 2 Configuration -->
					<div class="bg-green-50 rounded-lg p-4">
						<h3 class="font-medium text-green-900 mb-3">Pay Period 2 (same month)</h3>
						<p class="text-sm text-green-700 mb-3">For periods within the same month (e.g., 11th to 25th)</p>

						<div class="grid grid-cols-3 gap-3">
							<div>
								<label for="period2Start" class="label text-sm">Start Day</label>
								<select id="period2Start" name="period2Start" bind:value={config.period2Start} class="input">
									{#each dayOptions as day}
										<option value={day}>{day}</option>
									{/each}
								</select>
							</div>
							<div>
								<label for="period2End" class="label text-sm">End Day</label>
								<select id="period2End" name="period2End" bind:value={config.period2End} class="input">
									{#each dayOptions as day}
										<option value={day}>{day}</option>
									{/each}
								</select>
							</div>
							<div>
								<label for="period2Payday" class="label text-sm">Payday</label>
								<select id="period2Payday" name="period2Payday" bind:value={config.period2Payday} class="input">
									{#each dayOptions as day}
										<option value={day}>{day}</option>
									{/each}
								</select>
							</div>
						</div>
						<p class="text-xs text-green-600 mt-2">
							Example: {config.period2Start}th - {config.period2End}th, paid on the {config.period2Payday}th
						</p>
					</div>
				{/if}

				<button type="submit" disabled={loading} class="btn-primary w-full">
					{loading ? 'Saving...' : 'Save Pay Period Settings'}
				</button>
			</form>
		</div>

		<!-- Preview Panel -->
		<div class="card p-6">
			<h2 class="text-lg font-semibold mb-4">Pay Period Preview</h2>
			<p class="text-sm text-gray-600 mb-4">Based on your current configuration:</p>

			<div class="space-y-3">
				{#each data.payPeriods as period}
					<div class="p-3 rounded-lg border {period.isCurrent ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-gray-50'}">
						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium {period.isCurrent ? 'text-primary-900' : 'text-gray-900'}">
									{period.label}
									{#if period.isCurrent}
										<span class="ml-2 text-xs bg-primary-500 text-white px-2 py-0.5 rounded-full">Current</span>
									{/if}
								</div>
								<div class="text-sm {period.isCurrent ? 'text-primary-700' : 'text-gray-600'}">
									{formatDate(period.startDate)} - {formatDate(period.endDate)}
								</div>
							</div>
							<div class="text-right">
								<div class="text-xs text-gray-500">Payday</div>
								<div class="font-medium {period.isCurrent ? 'text-primary-700' : 'text-gray-700'}">
									{formatShortDate(period.payday)}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
				<div class="flex items-start">
					<svg class="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div class="text-sm text-yellow-700">
						<p class="font-medium">How it works:</p>
						<p class="mt-1">Reports can be filtered by pay period. Hours worked during each period are used to calculate pay.</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Summary -->
	<div class="card p-6 mt-6">
		<h2 class="text-lg font-semibold mb-4">Current Schedule Summary</h2>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="flex items-center p-4 bg-blue-50 rounded-lg">
				<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
					<span class="text-blue-600 font-bold">1</span>
				</div>
				<div>
					<div class="font-medium text-blue-900">Period 1</div>
					<div class="text-sm text-blue-700">
						{config.period1Start}{getOrdinal(config.period1Start)} - {config.period1End}{getOrdinal(config.period1End)}
					</div>
					<div class="text-xs text-blue-600">Paid on the {config.period1Payday}{getOrdinal(config.period1Payday)}</div>
				</div>
			</div>
			<div class="flex items-center p-4 bg-green-50 rounded-lg">
				<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
					<span class="text-green-600 font-bold">2</span>
				</div>
				<div>
					<div class="font-medium text-green-900">Period 2</div>
					<div class="text-sm text-green-700">
						{config.period2Start}{getOrdinal(config.period2Start)} - {config.period2End}{getOrdinal(config.period2End)}
					</div>
					<div class="text-xs text-green-600">Paid on the {config.period2Payday}{getOrdinal(config.period2Payday)}</div>
				</div>
			</div>
		</div>
	</div>
</div>

<script context="module" lang="ts">
	function getOrdinal(n: number): string {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return s[(v - 20) % 10] || s[v] || s[0];
	}
</script>
