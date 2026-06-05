<script lang="ts">
	import type { PageData } from './$types';
	import { formatDateTime } from '$lib/utils';

	export let data: PageData;

	const filters: { id: 'all' | 'success' | 'failure'; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'success', label: 'Succeeded' },
		{ id: 'failure', label: 'Failed' }
	];

	let openId: string | null = null;
	function toggleOpen(id: string) {
		openId = openId === id ? null : id;
	}

	function pretty(v: unknown): string {
		if (v === null || v === undefined) return '—';
		return JSON.stringify(v, null, 2);
	}
</script>

<svelte:head><title>NRS Inventory Journal - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<div class="mt-2">
		<h1 class="text-2xl font-bold text-gray-900">NRS Inventory Journal</h1>
		<p class="text-gray-600 text-sm mt-1">
			Every NRS inventory write-API call (invstock/save), with the exact request and response.
			Failed auto-applies leave the item in the
			<a href="/admin/vendors/inventory-changes" class="text-primary-600 hover:underline">pending queue</a>
			for the CSV fallback.
		</p>
	</div>

	<div class="mt-4 flex items-center gap-3 flex-wrap">
		<div class="flex gap-2">
			{#each filters as f}
				<a
					href="?result={f.id}"
					class="px-3 py-1.5 rounded text-sm font-medium border {data.filter === f.id
						? 'bg-primary-600 text-white border-primary-600'
						: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}">
					{f.label}
				</a>
			{/each}
		</div>
		<div class="text-sm text-gray-500">
			<span class="text-green-700 font-medium">{data.counts.success}</span> ok ·
			<span class="text-red-700 font-medium">{data.counts.failure}</span> failed
		</div>
	</div>

	{#if data.entries.length === 0}
		<div class="card mt-6"><div class="card-body text-center text-gray-500 py-10">No journal entries yet.</div></div>
	{:else}
		<div class="card mt-6 overflow-hidden">
			<table class="w-full text-sm">
				<thead class="bg-gray-50 text-gray-500 text-left">
					<tr>
						<th class="px-3 py-2 font-medium">When</th>
						<th class="px-3 py-2 font-medium">Result</th>
						<th class="px-3 py-2 font-medium">Vendor</th>
						<th class="px-3 py-2 font-medium">Action</th>
						<th class="px-3 py-2 font-medium">Part #</th>
						<th class="px-3 py-2 font-medium">NRS item</th>
						<th class="px-3 py-2 font-medium">By</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.entries as e (e.id)}
						<tr class="hover:bg-gray-50">
							<td class="px-3 py-2 whitespace-nowrap text-gray-600">{formatDateTime(e.createdAt)}</td>
							<td class="px-3 py-2">
								{#if e.success}
									<span class="badge-success">saved</span>
								{:else}
									<span class="badge-danger">failed</span>
								{/if}
							</td>
							<td class="px-3 py-2">{e.vendorDisplayName ?? '—'}</td>
							<td class="px-3 py-2 text-gray-600">{e.action}</td>
							<td class="px-3 py-2 font-mono text-xs">{e.partNumber ?? '—'}</td>
							<td class="px-3 py-2 font-mono text-xs">{e.nrsPartId ?? '—'}</td>
							<td class="px-3 py-2 text-gray-600">{e.triggeredByName ?? '—'}</td>
							<td class="px-3 py-2 text-right">
								<button type="button" class="text-primary-600 hover:underline text-xs" on:click={() => toggleOpen(e.id)}>
									{openId === e.id ? 'Hide' : 'Details'}
								</button>
							</td>
						</tr>
						{#if openId === e.id}
							<tr class="bg-gray-50">
								<td colspan="8" class="px-3 py-3">
									{#if e.errorMessage}
										<div class="mb-2 text-sm text-red-700"><span class="font-medium">Error:</span> {e.errorMessage}</div>
									{/if}
									<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
										<div>
											<div class="text-xs font-medium text-gray-500 mb-1">Request → {e.endpoint}</div>
											<pre class="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-64">{pretty(e.requestPayload)}</pre>
										</div>
										<div>
											<div class="text-xs font-medium text-gray-500 mb-1">Response{e.httpStatus ? ` (HTTP ${e.httpStatus})` : ''}</div>
											<pre class="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-64">{pretty(e.responseBody)}</pre>
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
