<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	export let data: PageData;

	type Period = '7d' | '30d' | 'mtd';
	const periods: { value: Period; label: string }[] = [
		{ value: '7d', label: '7 days' },
		{ value: '30d', label: '30 days' },
		{ value: 'mtd', label: 'Month to date' }
	];

	function setPeriod(p: Period) {
		const url = new URL($page.url);
		url.searchParams.set('period', p);
		goto(url, { replaceState: true, keepFocus: true });
	}

	function fmtMoney(n: number): string {
		return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	function fmtShortDate(yyyyMmDd: string): string {
		// Render as "Tue Apr 29" in Pacific time
		try {
			const d = new Date(yyyyMmDd + 'T12:00:00Z');
			return new Intl.DateTimeFormat('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				timeZone: 'America/Los_Angeles'
			}).format(d);
		} catch {
			return yyyyMmDd;
		}
	}

	function fmtDelta(pct: number | null): { text: string; cls: string } | null {
		if (pct === null || !Number.isFinite(pct)) return null;
		const rounded = Math.round(pct * 10) / 10;
		if (rounded > 0) return { text: `↑ ${rounded.toFixed(1)}%`, cls: 'text-emerald-700 bg-emerald-50' };
		if (rounded < 0) return { text: `↓ ${Math.abs(rounded).toFixed(1)}%`, cls: 'text-red-700 bg-red-50' };
		return { text: '— 0%', cls: 'text-gray-600 bg-gray-100' };
	}

	$: hasLeaderboardData = data.leaderboard.rows.length > 0;
</script>

<svelte:head><title>Vendor Leaderboard</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">🏆 Vendor Leaderboard</h1>
			<p class="text-gray-600 text-sm mt-1">
				{data.range.start} – {data.range.end}
			</p>
		</div>
		<div class="inline-flex rounded-md shadow-sm" role="group">
			{#each periods as p (p.value)}
				<button
					type="button"
					on:click={() => setPeriod(p.value)}
					class="px-3 py-1.5 text-sm border first:rounded-l-md last:rounded-r-md -ml-px first:ml-0 {data.period === p.value ? 'bg-primary-600 text-white border-primary-600 z-10' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
				>
					{p.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<!-- Top 10 -->
		<section class="card lg:col-span-2">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Top 10 by vendor portion</h2></div>
			<div class="card-body p-0">
				{#if !hasLeaderboardData}
					<div class="px-4 py-6 text-sm text-gray-500">No sales data for this period yet.</div>
				{:else}
					<table class="w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700 w-10">#</th>
								<th class="px-4 py-2 font-medium text-gray-700">Vendor</th>
								<th class="px-4 py-2 font-medium text-gray-700">Booth</th>
								<th class="px-4 py-2 font-medium text-gray-700 text-right">Vendor portion</th>
								<th class="px-4 py-2 font-medium text-gray-700 text-right">vs prior</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.leaderboard.rows as row (row.nrsVendorId)}
								{@const delta = fmtDelta(row.deltaPercent)}
								<tr>
									<td class="px-4 py-2 font-bold text-gray-700 tabular-nums">
										{#if row.rank === 1}🥇{:else if row.rank === 2}🥈{:else if row.rank === 3}🥉{:else}{row.rank}{/if}
									</td>
									<td class="px-4 py-2 text-gray-900">
										{row.displayName ?? row.nrsVendorName}
									</td>
									<td class="px-4 py-2 text-gray-500 text-xs">{row.boothNumber ?? '—'}</td>
									<td class="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(row.totalVendorPortion)}</td>
									<td class="px-4 py-2 text-right">
										{#if delta}
											<span class="px-2 py-0.5 rounded text-xs {delta.cls}">{delta.text}</span>
										{:else}
											<span class="text-xs text-gray-400">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</section>

		<!-- Hot Booth -->
		<section class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">🔥 Hot Booth</h2></div>
			<div class="card-body">
				{#if data.hotBooth.length === 0}
					<div class="text-sm text-gray-500">No standout movers this period.</div>
				{:else}
					<ul class="space-y-3">
						{#each data.hotBooth as h (h.nrsVendorId)}
							<li class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<div class="font-medium text-gray-900 truncate">{h.displayName}</div>
									<div class="text-xs text-gray-500 tabular-nums">
										{fmtMoney(h.priorTotal)} → {fmtMoney(h.currentTotal)}
									</div>
								</div>
								<span class="px-2 py-1 rounded text-sm font-semibold text-emerald-700 bg-emerald-50 whitespace-nowrap">
									↑ {h.deltaPercent.toFixed(1)}%
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<!-- Daily Champions -->
		<section class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">🥇 Daily Champions (last 7 days)</h2></div>
			<div class="card-body">
				{#if data.dailyWinners.length === 0}
					<div class="text-sm text-gray-500">No daily snapshots in this window yet.</div>
				{:else}
					<ul class="space-y-1.5 text-sm">
						{#each data.dailyWinners as w (w.date)}
							<li class="flex items-center justify-between gap-2">
								<span class="text-gray-500 tabular-nums whitespace-nowrap">{fmtShortDate(w.date)}</span>
								<span class="text-gray-900 font-medium truncate flex-1 text-center px-2">{w.vendor.displayName}</span>
								<span class="tabular-nums text-gray-700">{fmtMoney(w.vendor.vendorPortion)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<!-- Best-Selling Items -->
		<section class="card lg:col-span-2">
			<div class="card-header"><h2 class="font-semibold text-gray-900">💎 Best-Selling Items</h2></div>
			<div class="card-body p-0">
				{#if data.bestItems.length === 0}
					<div class="px-4 py-6 text-sm text-gray-500">No item-level transaction data in this window.</div>
				{:else}
					<table class="w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700">Item</th>
								<th class="px-4 py-2 font-medium text-gray-700">Vendor</th>
								<th class="px-4 py-2 font-medium text-gray-700 text-right">Units</th>
								<th class="px-4 py-2 font-medium text-gray-700 text-right">Gross</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.bestItems as item (item.partNumber)}
								<tr>
									<td class="px-4 py-2">
										<div class="font-medium text-gray-900">{item.partName ?? '—'}</div>
										<div class="text-xs text-gray-500 font-mono">{item.partNumber}</div>
									</td>
									<td class="px-4 py-2 text-gray-700">{item.vendorDisplayName}</td>
									<td class="px-4 py-2 text-right tabular-nums">{item.totalUnits}</td>
									<td class="px-4 py-2 text-right tabular-nums">{fmtMoney(item.totalGross)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</section>

		<!-- Most items in one day -->
		<section class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">🎯 Most Items in One Day</h2></div>
			<div class="card-body">
				{#if !data.mostItemsDay}
					<div class="text-sm text-gray-500">No item-level data in this window.</div>
				{:else}
					<div class="text-3xl font-extrabold text-gray-900 tabular-nums">{data.mostItemsDay.itemCount}</div>
					<div class="text-sm text-gray-700 mt-1">
						items sold by <span class="font-semibold">{data.mostItemsDay.displayName}</span>
					</div>
					<div class="text-xs text-gray-500 mt-1">
						on {fmtShortDate(data.mostItemsDay.date)} across {data.mostItemsDay.transactionCount} transaction{data.mostItemsDay.transactionCount === 1 ? '' : 's'}
					</div>
				{/if}
			</div>
		</section>

		<!-- Longest streaks -->
		<section class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">📈 Longest Active Streaks</h2></div>
			<div class="card-body">
				{#if data.streaks.length === 0}
					<div class="text-sm text-gray-500">No transaction streaks in this window.</div>
				{:else}
					<ul class="space-y-2 text-sm">
						{#each data.streaks as s, i (s.nrsVendorId)}
							<li class="flex items-center justify-between gap-2">
								<span class="text-gray-500 w-5 tabular-nums">{i + 1}.</span>
								<span class="text-gray-900 font-medium truncate flex-1">{s.displayName}</span>
								<span class="tabular-nums whitespace-nowrap">
									<span class="font-semibold">{s.streakDays}</span>
									<span class="text-gray-500"> day{s.streakDays === 1 ? '' : 's'}</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>
	</div>
</div>
