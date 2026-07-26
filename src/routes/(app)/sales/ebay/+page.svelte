<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	export let data: PageData;

	function changeRange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const url = new URL($page.url);
		url.searchParams.set('days', val);
		url.searchParams.delete('page');
		goto(url.pathname + '?' + url.searchParams.toString(), { noScroll: true });
	}

	function gotoPage(p: number) {
		const url = new URL($page.url);
		url.searchParams.set('page', String(p));
		goto(url.pathname + '?' + url.searchParams.toString(), { noScroll: true });
	}

	function fmtMoney(n: number | null | undefined): string {
		return n == null ? '—' : `$${Number(n).toFixed(2)}`;
	}
	function fmtDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>eBay Sales - TeamTime</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-6">
	<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">eBay Sales</h1>
			<p class="text-sm text-gray-600">
				Both seller accounts, synced from ListFlow ·
				<a href="/sales" class="text-primary-600 hover:underline">Store sales →</a>
			</p>
		</div>
		<select
			class="input w-auto"
			value={String(data.rangeDays)}
			on:change={changeRange}
			aria-label="Date range"
		>
			<option value="7">Last 7 days</option>
			<option value="14">Last 14 days</option>
			<option value="30">Last 30 days</option>
			<option value="60">Last 60 days</option>
			<option value="90">Last 90 days</option>
			<option value="180">Last 180 days</option>
			<option value="365">Last year</option>
		</select>
	</div>

	{#if !data.available}
		<div class="card">
			<div class="card-body text-center py-10">
				<p class="font-medium text-gray-900">eBay sales are unavailable right now</p>
				<p class="text-sm text-gray-600 mt-1">
					TeamTime could not reach ListFlow (the eBay system of record). Try again shortly.
				</p>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
			<div class="card">
				<div class="card-body">
					<p class="text-sm text-gray-600">Items sold</p>
					<p class="text-2xl font-bold text-gray-900">{data.totals.count}</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body">
					<p class="text-sm text-gray-600">Gross (this page)</p>
					<p class="text-2xl font-bold text-gray-900">{fmtMoney(data.totals.gross)}</p>
				</div>
			</div>
			<div class="card">
				<div class="card-body">
					<p class="text-sm text-gray-600">Commissions (this page)</p>
					<p class="text-2xl font-bold text-gray-900">{fmtMoney(data.totals.commissions)}</p>
				</div>
			</div>
		</div>

		<div class="card overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200 text-left text-gray-600">
							<th class="px-4 py-3 font-medium">Item</th>
							<th class="px-4 py-3 font-medium">Account</th>
							<th class="px-4 py-3 font-medium">Sold</th>
							<th class="px-4 py-3 font-medium text-right">Qty</th>
							<th class="px-4 py-3 font-medium text-right">Price</th>
							<th class="px-4 py-3 font-medium text-right">Total</th>
							<th class="px-4 py-3 font-medium">Listed by</th>
						</tr>
					</thead>
					<tbody>
						{#each data.sales as sale (sale.id)}
							<tr class="border-b border-gray-100 hover:bg-gray-50">
								<td class="px-4 py-3">
									<div class="flex items-center gap-3">
										{#if sale.imageUrl}
											<img
												src={sale.imageUrl}
												alt=""
												class="w-10 h-10 rounded object-cover bg-gray-100 flex-shrink-0"
												loading="lazy"
											/>
										{:else}
											<div class="w-10 h-10 rounded bg-gray-100 flex-shrink-0"></div>
										{/if}
										<div class="min-w-0">
											<p class="font-medium text-gray-900 truncate max-w-xs" title={sale.title}>
												{sale.title}
											</p>
											<p class="text-xs text-gray-500">#{sale.ebayOrderId}</p>
										</div>
									</div>
								</td>
								<td class="px-4 py-3 text-gray-700">{sale.account}</td>
								<td class="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(sale.soldAt)}</td>
								<td class="px-4 py-3 text-right text-gray-700">{sale.quantity}</td>
								<td class="px-4 py-3 text-right text-gray-700">{fmtMoney(sale.itemPrice)}</td>
								<td class="px-4 py-3 text-right font-medium text-gray-900"
									>{fmtMoney(sale.totalPrice)}</td
								>
								<td class="px-4 py-3">
									{#if sale.commission}
										<span class="text-gray-900">{sale.commission.agent.name}</span>
										<span class="text-xs text-gray-500 whitespace-nowrap">
											({fmtMoney(sale.commission.amount)})
										</span>
									{:else if sale.attributionStatus === 'HOUSE'}
										<span class="text-xs text-gray-500">House</span>
									{:else}
										<span class="text-xs text-amber-600">Unassigned</span>
									{/if}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="7" class="px-4 py-10 text-center text-gray-500">
									No eBay sales in this range.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if data.pagination.pages > 1}
				<div
					class="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600"
				>
					<span>
						Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} sales
					</span>
					<div class="flex gap-2">
						<button
							class="btn btn-secondary btn-sm"
							disabled={data.pagination.page <= 1}
							on:click={() => gotoPage(data.pagination.page - 1)}
						>
							Previous
						</button>
						<button
							class="btn btn-secondary btn-sm"
							disabled={data.pagination.page >= data.pagination.pages}
							on:click={() => gotoPage(data.pagination.page + 1)}
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
