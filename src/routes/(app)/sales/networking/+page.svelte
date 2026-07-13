<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils';

	export let data: PageData;

	let viewMode: 'daily' | 'weekly' = 'daily';

	function changeRange(e: Event) {
		const val = parseInt((e.target as HTMLSelectElement).value, 10);
		const url = new URL($page.url);
		url.searchParams.set('days', String(val));
		goto(url.pathname + '?' + url.searchParams.toString(), { noScroll: true });
	}

	const rangeLabel = (d: number) =>
		d >= 365 ? `${Math.round(d / 365)}y` : d >= 30 ? `${Math.round(d / 30)}mo` : `${d}d`;
	const fmtDay = (s: string) =>
		new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	const fmtWeek = (s: string) =>
		'Wk of ' + new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

	// newest first for the tables
	$: dailyDesc = [...data.salesData].reverse();
	$: weeklyDesc = [...data.weeklyData].reverse();
</script>

<svelte:head><title>Yakima Networking — Sales</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<div class="flex items-center justify-between flex-wrap gap-3">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Yakima Networking — Sales</h1>
			<p class="text-gray-600 text-sm mt-1">
				Direct sales (NRS store 1) vs Dale's labor. Net = sales − labor.
			</p>
		</div>
		<label class="text-sm text-gray-600">
			Range
			<select class="input ml-2 w-auto inline-block" on:change={changeRange} value={data.rangeDays}>
				{#each data.allowedRangeDays as d}
					<option value={d} selected={d === data.rangeDays}>{rangeLabel(d)}</option>
				{/each}
			</select>
		</label>
	</div>

	<!-- Summary cards -->
	<div class="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
		<div class="card"><div class="card-body">
			<div class="text-xs text-gray-500">Total Sales</div>
			<div class="text-2xl font-bold text-gray-900">{formatCurrency(data.summary.totalSales)}</div>
			<div class="text-xs text-gray-500 mt-1">{data.summary.daysWithSales} day{data.summary.daysWithSales === 1 ? '' : 's'} with sales</div>
		</div></div>
		<div class="card"><div class="card-body">
			<div class="text-xs text-gray-500">Total Labor (Dale)</div>
			<div class="text-2xl font-bold text-gray-900">{formatCurrency(data.summary.totalLabor)}</div>
		</div></div>
		<div class="card"><div class="card-body">
			<div class="text-xs text-gray-500">Net (Sales − Labor)</div>
			<div class="text-2xl font-bold {data.summary.totalNet >= 0 ? 'text-green-600' : 'text-red-600'}">{formatCurrency(data.summary.totalNet)}</div>
		</div></div>
		<div class="card"><div class="card-body">
			<div class="text-xs text-gray-500">Avg Daily Net</div>
			<div class="text-2xl font-bold {data.summary.avgDailyNet >= 0 ? 'text-gray-900' : 'text-red-600'}">{formatCurrency(data.summary.avgDailyNet)}</div>
		</div></div>
	</div>

	<!-- View toggle -->
	<div class="mt-6 flex gap-2">
		<button class="btn btn-sm {viewMode === 'daily' ? 'btn-primary' : 'btn-secondary'}" on:click={() => (viewMode = 'daily')}>Daily</button>
		<button class="btn btn-sm {viewMode === 'weekly' ? 'btn-primary' : 'btn-secondary'}" on:click={() => (viewMode = 'weekly')}>Weekly</button>
	</div>

	{#if viewMode === 'daily'}
		<div class="card mt-3"><div class="card-body p-0 overflow-x-auto">
			<table class="min-w-full text-sm">
				<thead class="bg-gray-50 text-left text-gray-600">
					<tr><th class="px-4 py-2">Date</th><th class="px-4 py-2 text-right">Sales</th><th class="px-4 py-2 text-right">Labor</th><th class="px-4 py-2 text-right">Net</th></tr>
				</thead>
				<tbody>
					{#each dailyDesc as d (d.date)}
						<tr class="border-t border-gray-100 {d.totalSales === 0 && d.labor === 0 ? 'opacity-50' : ''}">
							<td class="px-4 py-2">{fmtDay(d.date)}</td>
							<td class="px-4 py-2 text-right">{d.totalSales > 0 ? formatCurrency(d.totalSales) : '—'}</td>
							<td class="px-4 py-2 text-right text-gray-600">{d.labor > 0 ? formatCurrency(d.labor) : '—'}</td>
							<td class="px-4 py-2 text-right font-medium {d.net >= 0 ? 'text-gray-900' : 'text-red-600'}">{formatCurrency(d.net)}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">No data in this range.</td></tr>
					{/each}
				</tbody>
			</table>
		</div></div>
	{:else}
		<div class="card mt-3"><div class="card-body p-0 overflow-x-auto">
			<table class="min-w-full text-sm">
				<thead class="bg-gray-50 text-left text-gray-600">
					<tr><th class="px-4 py-2">Week</th><th class="px-4 py-2 text-right">Sales</th><th class="px-4 py-2 text-right">Labor</th><th class="px-4 py-2 text-right">Net</th><th class="px-4 py-2 text-right">Days</th></tr>
				</thead>
				<tbody>
					{#each weeklyDesc as w (w.week)}
						<tr class="border-t border-gray-100">
							<td class="px-4 py-2">{fmtWeek(w.week)}</td>
							<td class="px-4 py-2 text-right">{formatCurrency(w.totalSales)}</td>
							<td class="px-4 py-2 text-right text-gray-600">{formatCurrency(w.labor)}</td>
							<td class="px-4 py-2 text-right font-medium {w.net >= 0 ? 'text-gray-900' : 'text-red-600'}">{formatCurrency(w.net)}</td>
							<td class="px-4 py-2 text-right text-gray-500">{w.days}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">No data in this range.</td></tr>
					{/each}
				</tbody>
			</table>
		</div></div>
	{/if}

	<p class="text-xs text-gray-400 mt-4">
		Labor is Dale's clocked hours at the Yakima Networking location × his current rate.
	</p>
</div>
