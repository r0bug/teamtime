<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	export let data: PageData;

	// Filters
	let selectedAgent = data.filters.agent;
	let selectedStatus = data.filters.status;
	let selectedDays = data.filters.days;

	// Expanded action details
	let expandedActionId: string | null = null;

	function applyFilters() {
		const params = new URLSearchParams();
		if (selectedAgent !== 'all') params.set('agent', selectedAgent);
		if (selectedStatus !== 'all') params.set('status', selectedStatus);
		if (selectedDays !== 7) params.set('days', selectedDays.toString());
		goto(`/admin/ai/actions?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/admin/ai/actions?${params.toString()}`);
	}

	function toggleExpand(id: string) {
		expandedActionId = expandedActionId === id ? null : id;
	}

	function formatDate(date: Date | string): string {
		const d = new Date(date);
		return d.toLocaleString();
	}

	function formatJson(obj: unknown): string {
		if (!obj) return '';
		try {
			return JSON.stringify(obj, null, 2);
		} catch {
			return String(obj);
		}
	}

	function getStatusBadge(action: typeof data.actions[0]): { text: string; class: string } {
		if (action.error) {
			return { text: 'Error', class: 'bg-red-100 text-red-800' };
		}
		if (action.blockedReason) {
			return { text: 'Blocked', class: 'bg-yellow-100 text-yellow-800' };
		}
		if (action.executed) {
			return { text: 'Executed', class: 'bg-green-100 text-green-800' };
		}
		if (!action.toolName) {
			return { text: 'Observation', class: 'bg-blue-100 text-blue-800' };
		}
		return { text: 'Pending', class: 'bg-gray-100 text-gray-800' };
	}

	function getAgentName(agent: string): string {
		switch (agent) {
			case 'office_manager': return 'Office Manager';
			case 'revenue_optimizer': return 'Revenue Optimizer';
			default: return agent;
		}
	}
</script>

<svelte:head>
	<title>AI Actions Log - Admin</title>
</svelte:head>

<div class="p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="mb-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-gray-900">AI Actions Log</h1>
					<p class="text-gray-600 mt-1">View all AI agent decisions and actions</p>
				</div>
				<a href="/admin/ai" class="text-sm text-primary-600 hover:text-primary-700">
					Back to AI Settings
				</a>
			</div>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
			<div class="bg-white rounded-lg p-4 shadow-sm border">
				<div class="text-2xl font-bold text-gray-900">{data.stats.total}</div>
				<div class="text-sm text-gray-600">Total Actions</div>
			</div>
			<div class="bg-white rounded-lg p-4 shadow-sm border">
				<div class="text-2xl font-bold text-green-600">{data.stats.executed}</div>
				<div class="text-sm text-gray-600">Executed</div>
			</div>
			<div class="bg-white rounded-lg p-4 shadow-sm border">
				<div class="text-2xl font-bold text-yellow-600">{data.stats.blocked}</div>
				<div class="text-sm text-gray-600">Blocked</div>
			</div>
			<div class="bg-white rounded-lg p-4 shadow-sm border">
				<div class="text-2xl font-bold text-red-600">{data.stats.errors}</div>
				<div class="text-sm text-gray-600">Errors</div>
			</div>
			<div class="bg-white rounded-lg p-4 shadow-sm border">
				<div class="text-2xl font-bold text-blue-600">{data.stats.observations}</div>
				<div class="text-sm text-gray-600">Observations</div>
			</div>
			<div class="bg-white rounded-lg p-4 shadow-sm border">
				<div class="text-2xl font-bold text-gray-900">${(data.stats.totalCostCents / 100).toFixed(2)}</div>
				<div class="text-sm text-gray-600">Total Cost</div>
			</div>
		</div>

		<!-- Filters -->
		<div class="bg-white rounded-lg p-4 shadow-sm border mb-6">
			<div class="flex flex-wrap gap-4 items-end">
				<div>
					<label for="agent" class="block text-sm font-medium text-gray-700 mb-1">Agent</label>
					<select
						id="agent"
						bind:value={selectedAgent}
						on:change={applyFilters}
						class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
					>
						<option value="all">All Agents</option>
						<option value="office_manager">Office Manager ({data.stats.byAgent.office_manager})</option>
						<option value="revenue_optimizer">Revenue Optimizer ({data.stats.byAgent.revenue_optimizer})</option>
					</select>
				</div>

				<div>
					<label for="status" class="block text-sm font-medium text-gray-700 mb-1">Status</label>
					<select
						id="status"
						bind:value={selectedStatus}
						on:change={applyFilters}
						class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
					>
						<option value="all">All Status</option>
						<option value="executed">Executed</option>
						<option value="blocked">Blocked</option>
						<option value="error">Errors</option>
						<option value="observation">Observations Only</option>
					</select>
				</div>

				<div>
					<label for="days" class="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
					<select
						id="days"
						bind:value={selectedDays}
						on:change={applyFilters}
						class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
					>
						<option value={1}>Last 24 hours</option>
						<option value={7}>Last 7 days</option>
						<option value={30}>Last 30 days</option>
						<option value={90}>Last 90 days</option>
					</select>
				</div>
			</div>
		</div>

		<!-- Actions Table -->
		<div class="bg-white rounded-lg shadow-sm border overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Time
							</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Agent
							</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Action
							</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Status
							</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Target
							</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Cost
							</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Details
							</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each data.actions as action}
							{@const badge = getStatusBadge(action)}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
									{formatDate(action.createdAt)}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm">
									<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium
										{action.agent === 'office_manager' ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800'}">
										{getAgentName(action.agent)}
									</span>
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
									{#if action.toolName}
										<code class="bg-gray-100 px-2 py-1 rounded text-xs">{action.toolName}</code>
									{:else}
										<span class="text-gray-500 italic">Observation</span>
									{/if}
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
									<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {badge.class}">
										{badge.text}
									</span>
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{action.targetUserName || '-'}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{#if action.costCents}
										${(action.costCents / 100).toFixed(3)}
									{:else}
										-
									{/if}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm">
									<button
										on:click={() => toggleExpand(action.id)}
										class="text-primary-600 hover:text-primary-800"
									>
										{expandedActionId === action.id ? 'Hide' : 'Show'}
									</button>
								</td>
							</tr>
							{#if expandedActionId === action.id}
								<tr class="bg-gray-50">
									<td colspan="7" class="px-4 py-4">
										<div class="space-y-4">
											<!-- Reasoning -->
											{#if action.reasoning}
												<div>
													<h4 class="text-sm font-medium text-gray-700 mb-1">Reasoning</h4>
													<div class="bg-white p-3 rounded border text-sm text-gray-800 whitespace-pre-wrap">
														{action.reasoning}
													</div>
												</div>
											{/if}

											<!-- Tool Params -->
											{#if action.toolParams}
												<div>
													<h4 class="text-sm font-medium text-gray-700 mb-1">Parameters</h4>
													<pre class="bg-white p-3 rounded border text-xs overflow-x-auto">{formatJson(action.toolParams)}</pre>
												</div>
											{/if}

											<!-- Execution Result -->
											{#if action.executionResult}
												<div>
													<h4 class="text-sm font-medium text-gray-700 mb-1">Result</h4>
													<pre class="bg-white p-3 rounded border text-xs overflow-x-auto">{formatJson(action.executionResult)}</pre>
												</div>
											{/if}

											<!-- Blocked Reason -->
											{#if action.blockedReason}
												<div>
													<h4 class="text-sm font-medium text-yellow-700 mb-1">Blocked Reason</h4>
													<div class="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm text-yellow-800">
														{action.blockedReason}
													</div>
												</div>
											{/if}

											<!-- Error -->
											{#if action.error}
												<div>
													<h4 class="text-sm font-medium text-red-700 mb-1">Error</h4>
													<div class="bg-red-50 p-3 rounded border border-red-200 text-sm text-red-800">
														{action.error}
													</div>
												</div>
											{/if}

											<!-- Context Snapshot -->
											{#if action.contextSnapshot}
												<div>
													<h4 class="text-sm font-medium text-gray-700 mb-1">Context Snapshot</h4>
													<pre class="bg-white p-3 rounded border text-xs overflow-x-auto">{formatJson(action.contextSnapshot)}</pre>
												</div>
											{/if}

											<!-- Metadata -->
											<div class="flex gap-6 text-xs text-gray-500">
												<span>Run ID: <code class="bg-gray-100 px-1">{action.runId.slice(0, 8)}...</code></span>
												<span>Tokens: {action.tokensUsed || '-'}</span>
												<span>Context Tokens: {action.contextTokens || '-'}</span>
											</div>
										</div>
									</td>
								</tr>
							{/if}
						{/each}

						{#if data.actions.length === 0}
							<tr>
								<td colspan="7" class="px-4 py-8 text-center text-gray-500">
									No actions found for the selected filters.
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if data.pagination.totalPages > 1}
				<div class="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
					<div class="text-sm text-gray-600">
						Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to {Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalCount)} of {data.pagination.totalCount} results
					</div>
					<div class="flex gap-2">
						<button
							on:click={() => goToPage(data.pagination.page - 1)}
							disabled={data.pagination.page === 1}
							class="px-3 py-1 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Previous
						</button>
						{#each Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
							const start = Math.max(1, data.pagination.page - 2);
							return start + i;
						}).filter(p => p <= data.pagination.totalPages) as pageNum}
							<button
								on:click={() => goToPage(pageNum)}
								class="px-3 py-1 text-sm rounded border {pageNum === data.pagination.page ? 'bg-primary-600 text-white' : 'bg-white hover:bg-gray-50'}"
							>
								{pageNum}
							</button>
						{/each}
						<button
							on:click={() => goToPage(data.pagination.page + 1)}
							disabled={data.pagination.page === data.pagination.totalPages}
							class="px-3 py-1 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
