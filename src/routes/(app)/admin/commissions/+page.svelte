<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let approving = false;
	let approveMsg = '';

	function changePeriod(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const url = new URL($page.url);
		url.searchParams.set('period', val);
		goto(url.pathname + '?' + url.searchParams.toString(), { noScroll: true });
	}

	function fmtMoney(n: number): string {
		return `$${Number(n).toFixed(2)}`;
	}

	async function approvePeriod() {
		if (!confirm(`Approve all pending settlements for ${data.period}? Terms freeze permanently.`)) return;
		approving = true;
		approveMsg = '';
		try {
			const res = await fetch('/api/ebay/settlements/approve', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ period: data.period })
			});
			const out = await res.json();
			if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
			approveMsg = `Approved ${out.approved} settlements.`;
			await invalidateAll();
		} catch (err) {
			approveMsg = (err as Error).message;
		} finally {
			approving = false;
		}
	}
</script>

<svelte:head>
	<title>eBay Settlements - TeamTime</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 py-6">
	<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">eBay Settlements</h1>
			<p class="text-sm text-gray-600">
				Consignor / YakimaFinds / lister splits, computed here from ListFlow sales ·
				<a href="/admin/payroll" class="text-primary-600 hover:underline">Payroll export →</a>
			</p>
		</div>
		<div class="flex items-center gap-2">
			<select class="input w-auto" value={data.period} on:change={changePeriod} aria-label="Pay period">
				{#each data.periods.length ? data.periods : [data.period] as p}
					<option value={p}>{p}</option>
				{/each}
			</select>
			{#if data.isAdmin && data.report.pendingCount > 0}
				<button class="btn btn-primary btn-sm" disabled={approving} on:click={approvePeriod}>
					Approve {data.report.pendingCount} pending
				</button>
			{/if}
		</div>
	</div>

	{#if approveMsg}
		<p class="text-sm text-gray-700 mb-4">{approveMsg}</p>
	{/if}

	<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
		<div class="card"><div class="card-body">
			<p class="text-sm text-gray-600">Sales</p>
			<p class="text-2xl font-bold text-gray-900">{data.report.totals.sales}</p>
		</div></div>
		<div class="card"><div class="card-body">
			<p class="text-sm text-gray-600">Basis (pre-tax)</p>
			<p class="text-2xl font-bold text-gray-900">{fmtMoney(data.report.totals.basis)}</p>
		</div></div>
		<div class="card"><div class="card-body">
			<p class="text-sm text-gray-600">Consignor payouts</p>
			<p class="text-2xl font-bold text-gray-900">{fmtMoney(data.report.totals.consignor)}</p>
		</div></div>
		<div class="card"><div class="card-body">
			<p class="text-sm text-gray-600">YF net · commissions</p>
			<p class="text-2xl font-bold text-gray-900">
				{fmtMoney(data.report.totals.yf)}
				<span class="text-sm font-normal text-gray-500">· {fmtMoney(data.report.totals.commissions)}</span>
			</p>
		</div></div>
	</div>

	<div class="card overflow-hidden mb-6">
		<div class="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">Lister payouts — key into NRS</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200 text-left text-gray-600">
						<th class="px-4 py-3 font-medium">Lister</th>
						<th class="px-4 py-3 font-medium">Comp</th>
						<th class="px-4 py-3 font-medium text-right">Sales</th>
						<th class="px-4 py-3 font-medium text-right">Basis</th>
						<th class="px-4 py-3 font-medium text-right">Commission</th>
						<th class="px-4 py-3 font-medium text-right">Points</th>
					</tr>
				</thead>
				<tbody>
					{#each data.report.listers as l (l.userId)}
						<tr class="border-b border-gray-100">
							<td class="px-4 py-3 font-medium text-gray-900">{l.name}</td>
							<td class="px-4 py-3 text-gray-600">{l.compType ?? '—'}</td>
							<td class="px-4 py-3 text-right text-gray-700">{l.salesCount}</td>
							<td class="px-4 py-3 text-right text-gray-700">{fmtMoney(l.basis)}</td>
							<td class="px-4 py-3 text-right font-medium text-gray-900">{fmtMoney(l.commission)}</td>
							<td class="px-4 py-3 text-right text-gray-700">{l.points || '—'}</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No attributed sales this period.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div class="card overflow-hidden">
		<div class="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">Consignor payouts</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200 text-left text-gray-600">
						<th class="px-4 py-3 font-medium">Consignor</th>
						<th class="px-4 py-3 font-medium">Type</th>
						<th class="px-4 py-3 font-medium text-right">Sales</th>
						<th class="px-4 py-3 font-medium text-right">Basis</th>
						<th class="px-4 py-3 font-medium text-right">Payout</th>
					</tr>
				</thead>
				<tbody>
					{#each data.report.consignorTotals as c (c.consignorId)}
						<tr class="border-b border-gray-100">
							<td class="px-4 py-3 font-medium text-gray-900">{c.name}</td>
							<td class="px-4 py-3 text-gray-600">{c.type}</td>
							<td class="px-4 py-3 text-right text-gray-700">{c.salesCount}</td>
							<td class="px-4 py-3 text-right text-gray-700">{fmtMoney(c.basis)}</td>
							<td class="px-4 py-3 text-right font-medium text-gray-900">{fmtMoney(c.amount)}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">No consignment sales this period.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
