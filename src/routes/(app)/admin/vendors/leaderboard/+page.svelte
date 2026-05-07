<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	export let data: PageData;

	$: result = data.result;
	$: period = data.period;
	$: metric = data.metric;

	const periodOptions: { id: typeof data.period; label: string }[] = [
		{ id: '7d', label: '7 days' },
		{ id: '30d', label: '30 days' },
		{ id: 'mtd', label: 'Month to date' },
		{ id: 'ytd', label: 'Year to date' }
	];

	const metricOptions: { id: typeof data.metric; label: string; description: string }[] = [
		{ id: 'gross', label: 'Gross sales', description: 'Total ticket value before commission' },
		{ id: 'vendorPortion', label: 'Vendor portion', description: 'Owed to the vendor after commission' },
		{ id: 'retained', label: 'Retained', description: "Shop's cut" }
	];

	let customStart = data.range.start;
	let customEnd = data.range.end;

	function setPeriod(p: typeof data.period) {
		const params = new URLSearchParams();
		params.set('period', p);
		params.set('metric', metric);
		goto(`/admin/vendors/leaderboard?${params}`);
	}

	function setMetric(m: typeof data.metric) {
		const params = new URLSearchParams();
		params.set('period', period);
		params.set('metric', m);
		if (period === 'custom') {
			params.set('start', customStart);
			params.set('end', customEnd);
		}
		goto(`/admin/vendors/leaderboard?${params}`);
	}

	function applyCustom() {
		const params = new URLSearchParams();
		params.set('period', 'custom');
		params.set('metric', metric);
		params.set('start', customStart);
		params.set('end', customEnd);
		goto(`/admin/vendors/leaderboard?${params}`);
	}

	function rankDisplay(rank: number): string {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return String(rank);
	}

	function rankClass(rank: number): string {
		if (rank === 1) return 'bg-yellow-50 border-yellow-200';
		if (rank === 2) return 'bg-gray-50 border-gray-200';
		if (rank === 3) return 'bg-orange-50 border-orange-200';
		return 'bg-white';
	}

	function metricValue(row: typeof result.rows[0]): number {
		switch (metric) {
			case 'gross': return row.totalGross;
			case 'vendorPortion': return row.totalVendorPortion;
			case 'retained': return row.totalRetained;
		}
	}

	function totalValue(): number {
		switch (metric) {
			case 'gross': return result.totals.gross;
			case 'vendorPortion': return result.totals.vendorPortion;
			case 'retained': return result.totals.retained;
		}
	}

	function formatMoney(n: number): string {
		if (Math.abs(n) >= 1000) {
			return `$${(n / 1000).toFixed(1)}k`;
		}
		return `$${n.toFixed(2)}`;
	}

	$: activeMetric = metricOptions.find((m) => m.id === metric)!;
</script>

<svelte:head><title>Vendor Performance - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="mb-6 flex items-center justify-between flex-wrap gap-2">
		<div>
			<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
			<h1 class="text-2xl font-bold text-gray-900 mt-1">Vendor Performance</h1>
			<p class="text-gray-600 text-sm">
				Ranked by {activeMetric.label.toLowerCase()} · {result.period.start} → {result.period.end}
			</p>
		</div>
	</div>

	<!-- Period selector -->
	<div class="flex gap-2 mb-3 flex-wrap">
		{#each periodOptions as p (p.id)}
			<button
				type="button"
				class="flex-1 min-w-[100px] py-2 px-4 rounded-lg text-sm transition-colors {period === p.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
				on:click={() => setPeriod(p.id)}
			>
				{p.label}
			</button>
		{/each}
		<button
			type="button"
			class="flex-1 min-w-[100px] py-2 px-4 rounded-lg text-sm transition-colors {period === 'custom' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
			on:click={() => setPeriod('custom')}
		>
			Custom
		</button>
	</div>

	{#if period === 'custom'}
		<div class="card mb-3">
			<div class="card-body grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
				<div>
					<label class="label" for="customStart">Start</label>
					<input id="customStart" type="date" class="input" bind:value={customStart} />
				</div>
				<div>
					<label class="label" for="customEnd">End</label>
					<input id="customEnd" type="date" class="input" bind:value={customEnd} />
				</div>
				<button type="button" class="btn btn-primary" on:click={applyCustom}>Apply</button>
			</div>
		</div>
	{/if}

	<!-- Metric selector -->
	<div class="flex gap-2 mb-6 flex-wrap">
		{#each metricOptions as m (m.id)}
			<button
				type="button"
				class="flex-1 min-w-[140px] py-2 px-3 rounded border text-sm text-left transition-colors {metric === m.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:border-gray-300'}"
				on:click={() => setMetric(m.id)}
			>
				<div class="font-medium text-gray-900">{m.label}</div>
				<div class="text-xs text-gray-500">{m.description}</div>
			</button>
		{/each}
	</div>

	<!-- Period totals -->
	<div class="card mb-6 bg-gradient-to-r from-primary-500 to-blue-500 text-white">
		<div class="card-body grid grid-cols-2 lg:grid-cols-4 gap-4">
			<div>
				<p class="text-xs opacity-80">{activeMetric.label}</p>
				<p class="text-3xl font-bold">${totalValue().toFixed(2)}</p>
			</div>
			<div>
				<p class="text-xs opacity-80">Active vendors</p>
				<p class="text-3xl font-bold">{result.totals.vendorCount}</p>
			</div>
			<div>
				<p class="text-xs opacity-80">Gross</p>
				<p class="text-2xl font-bold">${result.totals.gross.toFixed(2)}</p>
			</div>
			<div>
				<p class="text-xs opacity-80">Retained</p>
				<p class="text-2xl font-bold">${result.totals.retained.toFixed(2)}</p>
			</div>
		</div>
	</div>

	<!-- Rankings -->
	<div class="card">
		<div class="card-header flex items-center justify-between">
			<h2 class="font-semibold text-gray-900">Rankings</h2>
			{#if result.priorPeriod}
				<p class="text-xs text-gray-500">Δ vs {result.priorPeriod.start} → {result.priorPeriod.end}</p>
			{/if}
		</div>
		<div class="divide-y divide-gray-100">
			{#each result.rows as row (row.nrsVendorId)}
				{@const value = metricValue(row)}
				<div class="flex items-center p-4 {rankClass(row.rank)}">
					<div class="w-12 text-center">
						<span class="text-2xl {row.rank > 3 ? 'text-gray-500 text-lg font-medium' : ''}">{rankDisplay(row.rank)}</span>
					</div>

					<div class="flex-1 min-w-0 ml-2">
						{#if row.vendorId}
							<a class="font-medium text-primary-700 hover:underline truncate block" href={`/admin/vendors/${row.vendorId}`}>
								{row.displayName ?? row.nrsVendorName}
							</a>
						{:else}
							<p class="font-medium text-gray-900 truncate">{row.nrsVendorName}</p>
						{/if}
						<div class="flex items-center gap-2 text-xs text-gray-500">
							{#if row.boothNumber}
								<span>Booth {row.boothNumber}</span>
							{/if}
							{#if row.status && row.status !== 'active'}
								<span class="text-orange-600">{row.status}</span>
							{/if}
							{#if !row.vendorId}
								<span class="text-amber-600">not in TeamTime — sync to import</span>
							{/if}
							<span>· {row.daysWithSales} day{row.daysWithSales === 1 ? '' : 's'} with sales</span>
						</div>
					</div>

					<div class="text-right">
						<p class="text-xl font-bold text-gray-900">${value.toFixed(2)}</p>
						{#if row.deltaPercent !== null}
							<p class="text-xs {row.deltaPercent >= 0 ? 'text-green-600' : 'text-red-600'}">
								{row.deltaPercent >= 0 ? '↑' : '↓'} {Math.abs(row.deltaPercent).toFixed(1)}%
							</p>
						{:else}
							<p class="text-xs text-gray-400">no prior data</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="p-8 text-center text-gray-500">
					<p>No sales data found for this period.</p>
					<p class="text-sm mt-1">Run the NRS import or pick a wider date range.</p>
				</div>
			{/each}
		</div>
	</div>

	<p class="mt-4 text-xs text-gray-500">
		Data source: <code>salesSnapshots</code> populated hourly from NRS.
		Click a vendor name for the live detail view (which fetches from NRS in real time).
	</p>
</div>
