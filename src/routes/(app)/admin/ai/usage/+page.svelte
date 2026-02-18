<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	function formatCents(cents: number): string {
		return `$${(cents / 100).toFixed(2)}`;
	}

	function formatAgent(agent: string): string {
		const names: Record<string, string> = {
			office_manager: 'Office Manager',
			revenue_optimizer: 'Revenue Optimizer',
			architect: 'Architect (Ada)'
		};
		return names[agent] || agent;
	}

	function emptyRunPct(): string {
		const stats = data.emptyRunStats;
		if (!stats.totalRuns) return '0%';
		const pct = ((Number(stats.emptyRuns) + Number(stats.skippedRuns)) / Number(stats.totalRuns)) * 100;
		return `${pct.toFixed(1)}%`;
	}

	function costPerAction(costs: typeof data.dailyCosts): string {
		const totalCost = costs.reduce((sum, c) => sum + Number(c.totalCost), 0);
		const totalActions = costs.reduce((sum, c) => sum + Number(c.totalActions), 0);
		if (totalActions === 0) return 'N/A';
		return formatCents(totalCost / totalActions);
	}

	const tabs = ['overview', 'runs', 'tools'] as const;
	let activeTab: typeof tabs[number] = 'overview';
</script>

<svelte:head>
	<title>AI Token Usage - TeamTime Admin</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-4 space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">AI Token Usage Dashboard</h1>
		<a href="/admin/ai" class="text-blue-600 hover:underline text-sm">&larr; Back to AI Config</a>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
		<div class="bg-white rounded-lg shadow p-4">
			<div class="text-sm text-gray-500">Today's Cost</div>
			<div class="text-2xl font-bold text-blue-600">
				{formatCents(data.dailyCosts.reduce((s, c) => s + Number(c.totalCost), 0))}
			</div>
			<div class="text-xs text-gray-400">
				{data.dailyCosts.reduce((s, c) => s + Number(c.totalRuns), 0)} runs
			</div>
		</div>
		<div class="bg-white rounded-lg shadow p-4">
			<div class="text-sm text-gray-500">This Week</div>
			<div class="text-2xl font-bold text-blue-600">
				{formatCents(data.weeklyCosts.reduce((s, c) => s + Number(c.totalCost), 0))}
			</div>
			<div class="text-xs text-gray-400">
				{data.weeklyCosts.reduce((s, c) => s + Number(c.totalRuns), 0)} runs
			</div>
		</div>
		<div class="bg-white rounded-lg shadow p-4">
			<div class="text-sm text-gray-500">This Month</div>
			<div class="text-2xl font-bold text-blue-600">
				{formatCents(data.monthlyCosts.reduce((s, c) => s + Number(c.totalCost), 0))}
			</div>
			<div class="text-xs text-gray-400">
				{data.monthlyCosts.reduce((s, c) => s + Number(c.totalRuns), 0)} runs
			</div>
		</div>
		<div class="bg-white rounded-lg shadow p-4">
			<div class="text-sm text-gray-500">Efficiency</div>
			<div class="text-2xl font-bold text-green-600">
				{emptyRunPct()}
			</div>
			<div class="text-xs text-gray-400">empty/skipped runs (lower is better)</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b">
		<nav class="flex gap-4">
			{#each tabs as tab}
				<button
					class="pb-2 px-1 border-b-2 text-sm font-medium transition-colors"
					class:border-blue-500={activeTab === tab}
					class:text-blue-600={activeTab === tab}
					class:border-transparent={activeTab !== tab}
					class:text-gray-500={activeTab !== tab}
					on:click={() => activeTab = tab}
				>
					{tab === 'overview' ? 'Cost by Agent' : tab === 'runs' ? 'Recent Runs' : 'Top Tools'}
				</button>
			{/each}
		</nav>
	</div>

	{#if activeTab === 'overview'}
		<!-- Cost by Agent (Weekly) -->
		<div class="bg-white rounded-lg shadow">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Weekly Cost by Agent</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="text-left p-3">Agent</th>
							<th class="text-right p-3">Cost</th>
							<th class="text-right p-3">Runs</th>
							<th class="text-right p-3">Skipped</th>
							<th class="text-right p-3">Actions</th>
							<th class="text-right p-3">Cost/Action</th>
						</tr>
					</thead>
					<tbody>
						{#each data.weeklyCosts as row}
							<tr class="border-t">
								<td class="p-3 font-medium">{formatAgent(row.agent)}</td>
								<td class="p-3 text-right">{formatCents(Number(row.totalCost))}</td>
								<td class="p-3 text-right">{Number(row.totalRuns)}</td>
								<td class="p-3 text-right text-green-600">{Number(row.skippedRuns)}</td>
								<td class="p-3 text-right">{Number(row.totalActions)}</td>
								<td class="p-3 text-right">
									{Number(row.totalActions) > 0 ? formatCents(Number(row.totalCost) / Number(row.totalActions)) : 'N/A'}
								</td>
							</tr>
						{:else}
							<tr><td colspan="6" class="p-4 text-center text-gray-400">No data yet</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else if activeTab === 'runs'}
		<!-- Recent Runs -->
		<div class="bg-white rounded-lg shadow">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Recent Runs</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="text-left p-3">Time</th>
							<th class="text-left p-3">Agent</th>
							<th class="text-right p-3">Cost</th>
							<th class="text-right p-3">Actions</th>
							<th class="text-right p-3">Duration</th>
							<th class="text-left p-3">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recentRuns as run}
							<tr class="border-t">
								<td class="p-3 text-gray-600">
									{new Date(run.createdAt).toLocaleString()}
								</td>
								<td class="p-3">{formatAgent(run.agent)}</td>
								<td class="p-3 text-right">{formatCents(run.costCents)}</td>
								<td class="p-3 text-right">{run.actionsTaken}</td>
								<td class="p-3 text-right">
									{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '-'}
								</td>
								<td class="p-3">
									{#if run.wasSkipped}
										<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
											Skipped
										</span>
									{:else if run.actionsTaken === 0}
										<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
											No action
										</span>
									{:else}
										<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
											Active
										</span>
									{/if}
								</td>
							</tr>
						{:else}
							<tr><td colspan="6" class="p-4 text-center text-gray-400">No runs yet</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else}
		<!-- Top Tools by Cost -->
		<div class="bg-white rounded-lg shadow">
			<div class="p-4 border-b">
				<h2 class="font-semibold">Top Token-Consuming Tools (Last 7 Days)</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="text-left p-3">Tool</th>
							<th class="text-right p-3">Total Cost</th>
							<th class="text-right p-3">Usage Count</th>
							<th class="text-right p-3">Avg Cost</th>
						</tr>
					</thead>
					<tbody>
						{#each data.topToolCosts as tool}
							<tr class="border-t">
								<td class="p-3 font-mono text-xs">{tool.toolName}</td>
								<td class="p-3 text-right">{formatCents(Number(tool.totalCost))}</td>
								<td class="p-3 text-right">{Number(tool.usageCount)}</td>
								<td class="p-3 text-right">
									{formatCents(Number(tool.totalCost) / Number(tool.usageCount))}
								</td>
							</tr>
						{:else}
							<tr><td colspan="4" class="p-4 text-center text-gray-400">No tool usage data yet</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
