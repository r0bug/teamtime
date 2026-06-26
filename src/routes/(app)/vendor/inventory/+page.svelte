<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { DESKTOP_LABEL_APP_DOWNLOADS } from '$lib/utils/desktop-label-app';

	export let data: PageData;
	export let form: ActionData;

	// Removal-request modal only. Adding items is done exclusively via the
	// "Make a tag" card, which always auto-generates the part number.
	let modalOpen = false;
	let editingNrsPartId: number | null = null;
	let editingPreviousPayload: Record<string, unknown> | null = null;
	let partNumber = '';
	let reason = '';

	function openDelete(item: typeof data.soldItems[0]) {
		editingNrsPartId = item.nrsPartId;
		editingPreviousPayload = { partName: item.partName, lastPrice: item.lastPrice };
		partNumber = item.partNumber;
		reason = '';
		modalOpen = true;
	}

	function closeModal() { modalOpen = false; }

	function statusClass(status: string): string {
		if (status === 'pending') return 'bg-amber-100 text-amber-800';
		if (status === 'applied') return 'bg-green-100 text-green-800';
		if (status === 'rejected') return 'bg-red-100 text-red-800';
		return 'bg-gray-100 text-gray-700';
	}
</script>

<svelte:head><title>Inventory — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">My Inventory</h1>
		<p class="text-sm text-gray-600 mt-1">
			{#if data.vendor.inventoryCodePrefix}
				All your item codes start with <code class="font-mono font-semibold">{data.vendor.inventoryCodePrefix}</code> and the rest is generated automatically.
			{:else}
				Your inventory prefix isn't set. Ask the shop to configure it before adding items.
			{/if}
		</p>
	</div>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form?.success === 'submit'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Removal requested. Staff will confirm the item isn't still on the sales floor before removing it from NRS.</div>
	{/if}
	{#if form?.success === 'cancel'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Change cancelled.</div>
	{/if}
	{#if form?.success === 'quickTag'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm flex items-center justify-between gap-2 flex-wrap">
			<span>
				{form.applied ? '✓ Tag created in NRS.' : '✓ Tag queued (staff will apply to NRS).'} Code: <code class="font-mono font-semibold">{form.partNumber}</code> — "{form.description}" — ${(Number(form.priceCents) / 100).toFixed(2)}
				{#if form.queuedForPrint}<span class="ml-1">· 🖨️ Sent to your label printer's queue.</span>{/if}
			</span>
		</div>
		{#if form.queueError}
			<div class="mt-2 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-sm">Tag created, but couldn't queue it for the label printer: {form.queueError}</div>
		{/if}
	{/if}

	<!-- Quick tag — fastest path: description + price → auto-generated barcode -->
	{#if data.vendor.inventoryCodePrefix}
		<section class="mt-6">
			<div class="card">
				<div class="card-header">
					<h2 class="font-semibold text-gray-900">Make a tag</h2>
					<p class="text-xs text-gray-500 mt-1">
						Type the description and price. We'll generate a unique barcode automatically — your <code class="font-mono">{data.vendor.inventoryCodePrefix}</code> code, then the date and a counter (e.g. <code class="font-mono">{data.vendor.inventoryCodePrefix}60526001</code>) — and queue it for the shop to add to NRS.
					</p>
				</div>
				<div class="card-body">
					<form method="POST" action="?/quickTag" use:enhance class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
						<div class="md:col-span-7">
							<label class="label" for="qt-description">Description</label>
							<input id="qt-description" name="description" type="text" class="input" required placeholder="Vintage Pyrex bowl, mid-century" />
						</div>
						<div class="md:col-span-3">
							<label class="label" for="qt-price">Price ($)</label>
							<input id="qt-price" name="priceDollars" type="number" step="0.01" min="0" class="input" required placeholder="24.99" />
						</div>
						<div class="md:col-span-2">
							<button type="submit" class="btn btn-primary w-full">Make Tag</button>
						</div>
						<div class="md:col-span-12 flex items-center gap-2 flex-wrap">
							<input id="qt-send-printer" name="sendToPrinter" type="checkbox" class="h-4 w-4" />
							<label for="qt-send-printer" class="text-sm text-gray-700">Send to my label printer (the desktop printing app will pick it up and print it)</label>
							<span class="text-xs text-gray-500">
								Don't have the app? Download for
								<a href={DESKTOP_LABEL_APP_DOWNLOADS.windows.url} download class="text-primary-600 hover:underline">Windows</a>
								or
								<a href={DESKTOP_LABEL_APP_DOWNLOADS.linux.url} download class="text-primary-600 hover:underline">Linux</a>.
							</span>
						</div>
					</form>
				</div>
			</div>
		</section>
	{/if}

	<!-- Pending changes -->
	<section class="mt-6">
		<h2 class="font-semibold text-gray-900 mb-2">My pending changes</h2>
		{#if data.pending.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No pending changes.</div></div>
		{:else}
			<div class="card">
				<div class="card-body p-0 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Type</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Part #</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Name</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Submitted</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Status</th>
								<th class="px-4 py-2"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.pending as p (p.id)}
								<tr>
									<td class="px-4 py-2"><span class="text-xs uppercase text-gray-500">{p.changeType}</span></td>
									<td class="px-4 py-2 font-mono">{p.partNumber}</td>
									<td class="px-4 py-2">{p.payload?.partName ?? '—'}</td>
									<td class="px-4 py-2 text-gray-500 text-xs">{new Date(p.submittedAt).toLocaleString()}</td>
									<td class="px-4 py-2">
										<span class="text-xs px-2 py-0.5 rounded-full {statusClass(p.status)}">{p.status}</span>
										{#if p.status === 'rejected' && p.rejectionReason}
											<div class="text-xs text-red-600 mt-1">{p.rejectionReason}</div>
										{/if}
										{#if p.status === 'applied' && p.nrsApplyNotes}
											<div class="text-xs text-gray-500 mt-1">{p.nrsApplyNotes}</div>
										{/if}
									</td>
									<td class="px-4 py-2 text-right whitespace-nowrap">
										{#if p.status === 'pending'}
											<form method="POST" action="?/cancel" use:enhance class="inline">
												<input type="hidden" name="id" value={p.id} />
												<button type="submit" class="text-red-600 hover:underline text-sm">Cancel</button>
											</form>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>

	<!-- Items I've sold -->
	<section class="mt-6">
		<h2 class="font-semibold text-gray-900 mb-2">Items I've sold</h2>
		<p class="text-xs text-gray-500 mb-2">Derived from your NRS sales history. Request removal of an item here if you've taken it off the floor.</p>
		{#if !data.vendor.nrsVendorId}
			<div class="card"><div class="card-body text-sm text-gray-500">Not linked to NRS yet — staff needs to set your NRS vendor ID.</div></div>
		{:else if data.soldItems.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No sales found yet for your booth.</div></div>
		{:else}
			<div class="card">
				<div class="card-body p-0 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Part #</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Name</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Last sold</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Units</th>
								<th class="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">Last price</th>
								<th class="px-4 py-2"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.soldItems as item (item.partNumber)}
								<tr>
									<td class="px-4 py-2 font-mono">{item.partNumber}</td>
									<td class="px-4 py-2">{item.partName ?? '—'}</td>
									<td class="px-4 py-2 text-gray-500 text-xs">{item.lastSold || '—'}</td>
									<td class="px-4 py-2 tabular-nums">{item.unitsSold}</td>
									<td class="px-4 py-2 tabular-nums">${item.lastPrice.toFixed(2)}</td>
									<td class="px-4 py-2 text-right whitespace-nowrap">
										<button type="button" class="text-red-600 hover:underline text-sm" on:click={() => openDelete(item)}>Remove</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>
</div>

{#if modalOpen}
	<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
		<div class="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
			<div class="p-4 border-b border-gray-200 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Remove item</h2>
				<button class="text-gray-400 hover:text-gray-600 text-2xl leading-none" on:click={closeModal}>×</button>
			</div>
			<form method="POST" action="?/submit" use:enhance={() => () => { closeModal(); }} class="p-4 space-y-3">
				<input type="hidden" name="changeType" value="delete" />
				<input type="hidden" name="partNumber" value={partNumber} />
				{#if editingNrsPartId !== null}
					<input type="hidden" name="nrsPartId" value={editingNrsPartId} />
				{/if}
				{#if editingPreviousPayload}
					<input type="hidden" name="previousPayload" value={JSON.stringify(editingPreviousPayload)} />
				{/if}

				<p class="text-sm text-gray-700">This requests that staff remove <strong class="font-mono">{partNumber}</strong> from NRS. Staff will confirm it's off the sales floor first.</p>
				<div>
					<label class="label" for="reason">Reason for removal <span class="text-red-600">*</span></label>
					<textarea id="reason" name="reason" rows="2" class="input" required bind:value={reason} placeholder="e.g. Took it home, donated, no longer for sale"></textarea>
				</div>

				<div class="flex justify-end gap-2 pt-2 border-t border-gray-200">
					<button type="button" class="btn btn-secondary" on:click={closeModal}>Cancel</button>
					<button type="submit" class="btn btn-danger">Request removal</button>
				</div>
			</form>
		</div>
	</div>
{/if}
