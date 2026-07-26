<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	export let data: PageData;

	function changePeriod(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const url = new URL($page.url);
		url.searchParams.set('period', val);
		goto(url.pathname + '?' + url.searchParams.toString(), { noScroll: true });
	}

	function fmtMoney(n: number): string {
		return `$${Number(n).toFixed(2)}`;
	}
</script>

<svelte:head>
	<title>eBay Commissions - TeamTime</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-6">
	<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">eBay Commissions</h1>
			<p class="text-sm text-gray-600">
				Listing-agent commissions on eBay sales, from ListFlow ·
				<a href="/admin/payroll" class="text-primary-600 hover:underline">Payroll export →</a>
			</p>
		</div>
		<select
			class="input w-auto"
			value={String(data.selectedIndex)}
			on:change={changePeriod}
			aria-label="Pay period"
		>
			{#each data.periods as period}
				<option value={String(period.index)}>
					{period.label}{period.isCurrent ? ' (current)' : ''}
				</option>
			{/each}
			<option value="all">All time</option>
		</select>
	</div>

	{#if !data.available}
		<div class="card">
			<div class="card-body text-center py-10">
				<p class="font-medium text-gray-900">Commission data is unavailable right now</p>
				<p class="text-sm text-gray-600 mt-1">
					TeamTime could not reach ListFlow. Try again shortly.
				</p>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
			<div class="card">
				<div class="card-body">
					<p class="text-sm text-gray-600">Total commissions</p>
					<p class="text-2xl font-bold text-gray-900">{fmtMoney(data.totals.commission)}</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body">
					<p class="text-sm text-gray-600">Unpaid</p>
					<p class="text-2xl font-bold {data.totals.unpaid > 0 ? 'text-amber-600' : 'text-gray-900'}">
						{fmtMoney(data.totals.unpaid)}
					</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body">
					<p class="text-sm text-gray-600">Commissioned sales</p>
					<p class="text-2xl font-bold text-gray-900">{data.totals.salesCount}</p>
				</div>
			</div>
		</div>

		<div class="card overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200 text-left text-gray-600">
							<th class="px-4 py-3 font-medium">Agent</th>
							<th class="px-4 py-3 font-medium text-right">Sales</th>
							<th class="px-4 py-3 font-medium text-right">Commission</th>
							<th class="px-4 py-3 font-medium text-right">Unpaid</th>
						</tr>
					</thead>
					<tbody>
						{#each data.agents as agent (agent.agentId)}
							<tr class="border-b border-gray-100 hover:bg-gray-50">
								<td class="px-4 py-3">
									<span class="font-medium text-gray-900">{agent.name}</span>
									{#if !agent.teamtimeUserId}
										<span class="ml-2 text-xs text-gray-400">(not linked to a TeamTime user)</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-right text-gray-700">{agent.salesCount}</td>
								<td class="px-4 py-3 text-right font-medium text-gray-900">
									{fmtMoney(agent.totalCommission)}
								</td>
								<td class="px-4 py-3 text-right {agent.unpaid > 0 ? 'text-amber-600 font-medium' : 'text-gray-500'}">
									{fmtMoney(agent.unpaid)}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="4" class="px-4 py-10 text-center text-gray-500">
									No commissions in this period.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<p class="text-xs text-gray-500 mt-3">
			Rates, attribution, and mark-as-paid are managed in ListFlow; this page mirrors its totals.
		</p>
	{/if}
</div>
