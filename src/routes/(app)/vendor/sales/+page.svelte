<script lang="ts">
	import type { PageData } from './$types';
	import SalesOverTimeChart from '$lib/components/SalesOverTimeChart.svelte';
	import TopItemsBarChart from '$lib/components/TopItemsBarChart.svelte';

	export let data: PageData;

	type Rec = { invoiceDate: string; totalPrice: number; partName: string | null; itemDescription: string };

	$: byDay = (() => {
		if (!data.range) return [];
		const map = new Map<string, number>();
		for (let d = new Date(data.range.start); d <= new Date(data.range.end); d.setUTCDate(d.getUTCDate() + 1)) {
			map.set(d.toISOString().slice(0, 10), 0);
		}
		for (const r of data.records as Rec[]) {
			const k = r.invoiceDate.slice(0, 10);
			map.set(k, (map.get(k) ?? 0) + (r.totalPrice ?? 0));
		}
		return Array.from(map.entries()).map(([date, total]) => ({ date, total }));
	})();

	$: topItems = (() => {
		const map = new Map<string, number>();
		for (const r of data.records as Rec[]) {
			const label = r.partName || r.itemDescription || 'Unnamed';
			map.set(label, (map.get(label) ?? 0) + (r.totalPrice ?? 0));
		}
		return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
	})();
</script>

<svelte:head><title>Sales — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-900">Sales (last 30 days)</h1>
	<p class="text-sm text-gray-600 mt-1">Live from NRS.</p>

	{#if data.notLinked}
		<div class="card mt-6"><div class="card-body text-sm text-gray-500">
			Your account isn't linked to NRS yet. Contact staff to set your NRS vendor ID.
		</div></div>
	{:else}
		<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
			<div class="card"><div class="card-body text-center">
				<div class="text-2xl font-bold text-gray-900">${data.summary.totalGross.toFixed(2)}</div>
				<div class="text-xs text-gray-600">Gross</div>
			</div></div>
			<div class="card"><div class="card-body text-center">
				<div class="text-2xl font-bold text-emerald-600">${data.summary.totalVendor.toFixed(2)}</div>
				<div class="text-xs text-gray-600">Your portion</div>
			</div></div>
			<div class="card"><div class="card-body text-center">
				<div class="text-2xl font-bold text-blue-600">${data.summary.totalRetained.toFixed(2)}</div>
				<div class="text-xs text-gray-600">Shop retained</div>
			</div></div>
			<div class="card"><div class="card-body text-center">
				<div class="text-2xl font-bold text-gray-900">{data.summary.transactionCount}</div>
				<div class="text-xs text-gray-600">Transactions</div>
			</div></div>
			<div class="card"><div class="card-body text-center">
				<div class="text-2xl font-bold text-gray-900">${data.summary.avgTransaction.toFixed(2)}</div>
				<div class="text-xs text-gray-600">Avg transaction</div>
			</div></div>
		</div>

		<div class="card mt-4">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Sales over time</h2></div>
			<div class="card-body"><SalesOverTimeChart data={byDay} /></div>
		</div>

		<div class="card mt-4">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Top items</h2></div>
			<div class="card-body"><TopItemsBarChart items={topItems} /></div>
		</div>
	{/if}
</div>
