<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;

	$: defaults = data.defaults;

	// Build editable list from defaults and any DB overrides
	$: pointEntries = Object.entries(defaults.pointValues).map(([key, val]) => ({
		key,
		value: data.configs[key] ?? String(val),
		defaultValue: val,
		category: 'points',
		description: formatLabel(key)
	}));

	$: streakEntries = Object.entries(defaults.streakMultipliers).map(([days, mult]) => ({
		key: `STREAK_MULT_${days}`,
		value: data.configs[`STREAK_MULT_${days}`] ?? String(mult),
		defaultValue: mult,
		category: 'streaks',
		description: `${days} day streak multiplier`
	}));

	$: levelEntries = defaults.levelThresholds.map((l) => ({
		key: `LEVEL_${l.level}_MIN`,
		value: data.configs[`LEVEL_${l.level}_MIN`] ?? String(l.minPoints),
		defaultValue: l.minPoints,
		category: 'levels',
		description: `Level ${l.level} (${l.name}) minimum points`
	}));

	function formatLabel(key: string): string {
		return key.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
	}

	const tabOptions = ['points', 'streaks', 'levels'] as const;
	let activeTab: typeof tabOptions[number] = 'points';
	let saveSuccess = false;
</script>

<div class="max-w-4xl mx-auto p-4 sm:p-6">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Gamification Settings</h1>
	</div>

	<!-- Tabs -->
	<div class="flex space-x-1 mb-6 bg-gray-100 rounded-lg p-1">
		{#each tabOptions as tab}
			<button
				class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors {activeTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}"
				on:click={() => activeTab = tab}
			>
				{tab.charAt(0).toUpperCase() + tab.slice(1)}
			</button>
		{/each}
	</div>

	<form method="POST" action="?/save" use:enhance={() => {
		return async ({ result }) => {
			if (result.type === 'success') {
				saveSuccess = true;
				setTimeout(() => saveSuccess = false, 3000);
			}
		};
	}}>
		{#if saveSuccess}
			<div class="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">Settings saved successfully.</div>
		{/if}

		<div class="bg-white rounded-lg shadow divide-y">
			{#if activeTab === 'points'}
				{#each pointEntries as entry}
					<div class="flex items-center justify-between p-4">
						<div>
							<div class="text-sm font-medium text-gray-900">{entry.description}</div>
							<div class="text-xs text-gray-500">Default: {entry.defaultValue}</div>
						</div>
						<div class="flex items-center gap-2">
							<input
								type="number"
								name="config_{entry.key}"
								value={entry.value}
								class="w-20 px-2 py-1 text-sm border rounded text-right"
							/>
							<input type="hidden" name="category_{entry.key}" value="points" />
							<input type="hidden" name="desc_{entry.key}" value={entry.description} />
						</div>
					</div>
				{/each}
			{:else if activeTab === 'streaks'}
				{#each streakEntries as entry}
					<div class="flex items-center justify-between p-4">
						<div>
							<div class="text-sm font-medium text-gray-900">{entry.description}</div>
							<div class="text-xs text-gray-500">Default: {entry.defaultValue}x</div>
						</div>
						<div class="flex items-center gap-2">
							<input
								type="number"
								step="0.1"
								name="config_{entry.key}"
								value={entry.value}
								class="w-20 px-2 py-1 text-sm border rounded text-right"
							/>
							<input type="hidden" name="category_{entry.key}" value="streaks" />
							<input type="hidden" name="desc_{entry.key}" value={entry.description} />
						</div>
					</div>
				{/each}
			{:else if activeTab === 'levels'}
				{#each levelEntries as entry}
					<div class="flex items-center justify-between p-4">
						<div>
							<div class="text-sm font-medium text-gray-900">{entry.description}</div>
							<div class="text-xs text-gray-500">Default: {entry.defaultValue.toLocaleString()} pts</div>
						</div>
						<div class="flex items-center gap-2">
							<input
								type="number"
								name="config_{entry.key}"
								value={entry.value}
								class="w-24 px-2 py-1 text-sm border rounded text-right"
							/>
							<input type="hidden" name="category_{entry.key}" value="levels" />
							<input type="hidden" name="desc_{entry.key}" value={entry.description} />
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="mt-4 flex justify-end">
			<button
				type="submit"
				class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
			>
				Save Changes
			</button>
		</div>
	</form>
</div>
