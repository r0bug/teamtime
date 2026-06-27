<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	function money(cents: number | null): string {
		return cents == null ? '—' : `$${(cents / 100).toFixed(2)}`;
	}
	function when(d: string | Date): string {
		return new Date(d).toLocaleString();
	}
	function ownerLabel(t: string): string {
		return t === 'shop' ? 'Shop / shared' : t === 'vendor_byo' ? 'Vendor (BYO)' : t;
	}
</script>

<svelte:head><title>Labels & Tags — Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div class="mb-4">
		<h1 class="text-2xl font-bold text-gray-900">Labels &amp; Tags</h1>
		<p class="text-sm text-gray-600 mt-1">
			Tags waiting to print, vendor inventory changes, label formats, and registered printers.
		</p>
	</div>

	<!-- Quick links to the related tools -->
	<div class="flex gap-2 flex-wrap mb-6">
		<a href="/admin/vendors/inventory-changes" class="btn btn-secondary">Inventory change queue</a>
		<a href="/admin/label-formats" class="btn btn-secondary">Label formats</a>
		<a href="/admin/vendors" class="btn btn-secondary">Vendors</a>
	</div>

	<!-- Waiting to print -->
	<section class="mb-8">
		<h2 class="font-semibold text-gray-900 mb-2">
			Waiting to print
			<span class="text-sm font-normal text-gray-500">({data.waitingToPrint.length})</span>
		</h2>
		<p class="text-xs text-gray-500 mb-2">
			Tags created in TeamTime (or the app) that haven't been printed yet. The vendor's desktop
			label app — or the Yakima Finds kiosk — drains this queue; jobs drop off once printed.
		</p>
		{#if data.waitingToPrint.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">Nothing waiting to print.</div></div>
		{:else}
			<div class="card">
				<div class="card-body p-0 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Vendor</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Part #</th>
								<th class="px-4 py-2 font-medium text-gray-700">Description</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Price</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Copies</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Source</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Created</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.waitingToPrint as job (job.id)}
								<tr>
									<td class="px-4 py-2 whitespace-nowrap">{job.vendorName}</td>
									<td class="px-4 py-2 font-mono whitespace-nowrap">{job.partNumber}</td>
									<td class="px-4 py-2">{job.description ?? '—'}</td>
									<td class="px-4 py-2 tabular-nums whitespace-nowrap">{money(job.priceCents)}</td>
									<td class="px-4 py-2 tabular-nums">{job.copies}</td>
									<td class="px-4 py-2 whitespace-nowrap">
										<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{job.source}</span>
									</td>
									<td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{when(job.createdAt)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>

	<!-- Printers -->
	<section>
		<h2 class="font-semibold text-gray-900 mb-2">
			Printers
			<span class="text-sm font-normal text-gray-500">({data.printers.length})</span>
		</h2>
		<p class="text-xs text-gray-500 mb-2">
			Registered label printers (read-only). Vendor BYO units and shop/shared printers. Printer
			connectivity and selection live in the standalone label app; this is the registry.
		</p>
		{#if data.printers.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No printers registered yet.</div></div>
		{:else}
			<div class="card">
				<div class="card-body p-0 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Kit ID</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Owner</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Vendor</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Model</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">DPI</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Backend</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Lang</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Preferred format</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.printers as p (p.id)}
								<tr>
									<td class="px-4 py-2 font-mono whitespace-nowrap">{p.kitId ?? '—'}</td>
									<td class="px-4 py-2 whitespace-nowrap">{ownerLabel(p.ownerType)}</td>
									<td class="px-4 py-2 whitespace-nowrap">{p.vendorName ?? '—'}</td>
									<td class="px-4 py-2 whitespace-nowrap">{p.printerModel}</td>
									<td class="px-4 py-2 tabular-nums">{p.printerDpi}</td>
									<td class="px-4 py-2 whitespace-nowrap">{p.backend}</td>
									<td class="px-4 py-2 whitespace-nowrap">{p.commandLang}</td>
									<td class="px-4 py-2 font-mono whitespace-nowrap">{p.preferredFormatCode ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>
</div>
