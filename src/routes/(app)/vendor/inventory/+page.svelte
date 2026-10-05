<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { DESKTOP_LABEL_APP_DOWNLOADS } from '$lib/utils/desktop-label-app';

	export let data: PageData;
	export let form: ActionData;

	type Item = PageData['items'][number];

	let search = '';
	let showInactive = false;

	$: filtered = data.items.filter((i) => {
		if (!showInactive && !i.active) return false;
		if (!search.trim()) return true;
		const q = search.toLowerCase();
		return (
			(i.partNumber ?? '').toLowerCase().includes(q) ||
			(i.name ?? '').toLowerCase().includes(q) ||
			(i.description ?? '').toLowerCase().includes(q)
		);
	});

	// Bulk selection (by invStockId)
	let selected = new Set<number>();
	function toggle(id: number) {
		selected.has(id) ? selected.delete(id) : selected.add(id);
		selected = selected;
	}
	function selectAllVisible() {
		for (const i of filtered) if (i.active) selected.add(i.invStockId);
		selected = selected;
	}
	function clearSelection() { selected = new Set(); }
	$: selectedItems = data.items.filter((i) => selected.has(i.invStockId));

	// Modals
	let editItem: Item | null = null;
	let editPrice = '';
	let editDescription = '';
	function openEdit(i: Item) {
		editItem = i;
		editPrice = i.retailPrice.toFixed(2);
		editDescription = i.description ?? i.name ?? '';
	}

	let stockItem: Item | null = null;
	let addQty = '1';
	function openStock(i: Item) { stockItem = i; addQty = '1'; }

	let deactItem: Item | null = null;
	let deactReason = '';
	function openDeact(i: Item) { deactItem = i; deactReason = ''; }

	let bulkOpen = false;
	let bulkMode: 'percent' | 'set' = 'percent';
	let bulkAmount = '';

	function closeAll() {
		editItem = null; stockItem = null; deactItem = null; bulkOpen = false;
	}

	function statusClass(status: string): string {
		if (status === 'pending') return 'bg-amber-100 text-amber-800';
		if (status === 'applied') return 'bg-green-100 text-green-800';
		if (status === 'rejected') return 'bg-red-100 text-red-800';
		return 'bg-gray-100 text-gray-700';
	}
	const money = (cents: number | null | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`;
</script>

<svelte:head><title>Inventory — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">My Inventory</h1>
		<p class="text-sm text-gray-600 mt-1">
			{#if data.vendor.inventoryCodePrefix}
				All your item codes start with <code class="font-mono font-semibold">{data.vendor.inventoryCodePrefix}</code>. Prices and details you change here update NRS right away.
			{:else}
				Your inventory prefix isn't set. Ask the shop to configure it before adding items.
			{/if}
		</p>
	</div>

	<!-- Result banners -->
	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form?.success === 'quickTag'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
			✓ Tag created in NRS: <code class="font-mono font-semibold">{form.partNumber}</code> — "{form.description}" — {money(Number(form.priceCents))}
			{#if form.queuedForPrint}<span class="ml-1">· 🖨️ Queued to print.</span>{/if}
		</div>
	{/if}
	{#if form?.success === 'editItem'}
		<div class="mt-4 p-3 rounded text-sm {form.applied ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}">
			{#if form.applied}✓ Updated <code class="font-mono">{form.partNumber}</code> in NRS.{#if form.queuedForPrint} New tag queued to print.{/if}
			{:else}Saved <code class="font-mono">{form.partNumber}</code> — NRS didn't accept it yet ({form.applyError}); staff will apply it shortly.{/if}
		</div>
	{/if}
	{#if form?.success === 'addStock'}
		<div class="mt-4 p-3 rounded text-sm {form.applied ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}">
			{#if form.applied}✓ Added {form.addQty} to <code class="font-mono">{form.partNumber}</code>{#if form.queuedForPrint} · {form.addQty} tag(s) queued.{/if}
			{:else}Requested +{form.addQty} on <code class="font-mono">{form.partNumber}</code> — NRS didn't accept it yet; staff will apply it.{/if}
		</div>
	{/if}
	{#if form?.success === 'deactivate'}
		<div class="mt-4 p-3 rounded text-sm {form.applied ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}">
			{#if form.applied}✓ <code class="font-mono">{form.partNumber}</code> deactivated in NRS (kept in records, off the active catalog).
			{:else}Deactivation of <code class="font-mono">{form.partNumber}</code> is pending — staff will apply it.{/if}
		</div>
	{/if}
	{#if form?.success === 'bulkPrice'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
			✓ Bulk price update: {form.applied} applied{#if form.failed} · {form.failed} failed (left pending for staff){/if}.
		</div>
	{/if}
	{#if form?.success === 'cancel'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Change cancelled.</div>
	{/if}

	<!-- Make a tag -->
	{#if data.vendor.inventoryCodePrefix}
		<section class="mt-6">
			<div class="card">
				<div class="card-header">
					<h2 class="font-semibold text-gray-900">Make a tag</h2>
					<p class="text-xs text-gray-500 mt-1">New item — we generate the barcode (<code class="font-mono">{data.vendor.inventoryCodePrefix}</code> + date + counter), add it to NRS, and queue it to print.</p>
				</div>
				<div class="card-body">
					<form method="POST" action="?/quickTag" use:enhance class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
						<div class="md:col-span-6">
							<label class="label" for="qt-description">Description</label>
							<input id="qt-description" name="description" type="text" class="input" required placeholder="Vintage Pyrex bowl, mid-century" />
						</div>
						<div class="md:col-span-2">
							<label class="label" for="qt-price">Price ($)</label>
							<input id="qt-price" name="priceDollars" type="number" step="0.01" min="0" class="input" required placeholder="24.99" />
						</div>
						<div class="md:col-span-2">
							<label class="label" for="qt-qty">Copies</label>
							<input id="qt-qty" name="quantity" type="number" step="1" min="1" value="1" class="input" />
						</div>
						<div class="md:col-span-2">
							<button type="submit" class="btn btn-primary w-full">Make Tag</button>
						</div>
					</form>
					<p class="text-xs text-gray-500 mt-2">
						Print from the desktop label app or the Yakima Finds kiosk. Download for
						<a href={DESKTOP_LABEL_APP_DOWNLOADS.windows.url} download class="text-primary-600 hover:underline">Windows</a> or
						<a href={DESKTOP_LABEL_APP_DOWNLOADS.linux.url} download class="text-primary-600 hover:underline">Linux</a>.
					</p>
				</div>
			</div>
		</section>
	{/if}

	<!-- Live inventory -->
	<section class="mt-6">
		<div class="flex items-center justify-between flex-wrap gap-2 mb-2">
			<div>
				<h2 class="font-semibold text-gray-900">My items in NRS</h2>
				{#if data.syncedAt}
					<p class="text-xs text-gray-400">Synced from NRS {new Date(data.syncedAt).toLocaleString()} · <a href="/vendor/inventory" class="text-primary-600 hover:underline" data-sveltekit-reload>refresh</a></p>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				<label class="text-xs text-gray-600 flex items-center gap-1">
					<input type="checkbox" bind:checked={showInactive} /> Show inactive
				</label>
				<input type="search" bind:value={search} placeholder="Search part #, name…" class="input input-sm w-56" />
			</div>
		</div>

		{#if !data.vendor.nrsVendorId}
			<div class="card"><div class="card-body text-sm text-gray-500">Not linked to NRS yet — staff needs to set your NRS vendor ID.</div></div>
		{:else if data.isHouseVendor}
			<div class="card"><div class="card-body text-sm text-gray-600">This account is linked to the house/store catalog, which is too large to manage here. Bulk actions are disabled. Use “Make a tag” for new items.</div></div>
		{:else if data.inventoryError}
			<div class="card"><div class="card-body text-sm text-amber-700">{data.inventoryError}</div></div>
		{:else}
			{#if data.inventoryPartial}
				<div class="mb-2 p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs">
					Showing the first {data.items.length} of {data.totalItemCount} items. Use search to find a specific one.
				</div>
			{/if}

			<!-- Bulk bar -->
			{#if selected.size > 0}
				<div class="mb-2 p-3 bg-primary-50 border border-primary-200 rounded flex items-center gap-3 flex-wrap">
					<span class="text-sm font-medium text-primary-800">{selected.size} selected</span>
					<button class="btn btn-sm btn-primary" on:click={() => (bulkOpen = true)}>Change price…</button>
					<button class="btn btn-sm btn-secondary" on:click={clearSelection}>Clear</button>
				</div>
			{/if}

			<div class="card">
				<div class="card-body p-0 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-3 py-2">
									<button class="text-xs text-primary-600 hover:underline" on:click={selectAllVisible} title="Select all visible active items">All</button>
								</th>
								<th class="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Part #</th>
								<th class="px-3 py-2 font-medium text-gray-700">Name</th>
								<th class="px-3 py-2 font-medium text-gray-700 text-right whitespace-nowrap">Price</th>
								<th class="px-3 py-2 font-medium text-gray-700 text-right whitespace-nowrap">On hand</th>
								<th class="px-3 py-2 font-medium text-gray-700 text-right whitespace-nowrap">Sold</th>
								<th class="px-3 py-2"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#if filtered.length === 0}
								<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">No items match.</td></tr>
							{:else}
								{#each filtered as i (i.invStockId)}
									<tr class:opacity-50={!i.active}>
										<td class="px-3 py-2">
											{#if i.active}
												<input type="checkbox" checked={selected.has(i.invStockId)} on:change={() => toggle(i.invStockId)} />
											{/if}
										</td>
										<td class="px-3 py-2 font-mono whitespace-nowrap">{i.partNumber}{#if !i.active}<span class="ml-1 text-xs text-gray-400">(inactive)</span>{/if}</td>
										<td class="px-3 py-2">{i.name ?? '—'}</td>
										<td class="px-3 py-2 text-right tabular-nums">${i.retailPrice.toFixed(2)}</td>
										<td class="px-3 py-2 text-right tabular-nums">{i.quantityOnHand}</td>
										<td class="px-3 py-2 text-right tabular-nums text-gray-500">{i.unitsSold || ''}</td>
										<td class="px-3 py-2 text-right whitespace-nowrap">
											{#if i.active}
												<button class="text-primary-600 hover:underline text-sm" on:click={() => openEdit(i)}>Edit</button>
												<button class="text-primary-600 hover:underline text-sm ml-2" on:click={() => openStock(i)}>+ Stock</button>
												<button class="text-red-600 hover:underline text-sm ml-2" on:click={() => openDeact(i)}>Deactivate</button>
											{/if}
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>

	<!-- My changes -->
	<section class="mt-6">
		<h2 class="font-semibold text-gray-900 mb-2">My recent changes</h2>
		{#if data.pending.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No changes yet.</div></div>
		{:else}
			<div class="card">
				<div class="card-body p-0 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700">Type</th>
								<th class="px-4 py-2 font-medium text-gray-700">Part #</th>
								<th class="px-4 py-2 font-medium text-gray-700">Detail</th>
								<th class="px-4 py-2 font-medium text-gray-700">When</th>
								<th class="px-4 py-2 font-medium text-gray-700">Status</th>
								<th class="px-4 py-2"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.pending as p (p.id)}
								<tr>
									<td class="px-4 py-2"><span class="text-xs uppercase text-gray-500">{p.changeType === 'delete' ? 'deactivate' : p.changeType}</span></td>
									<td class="px-4 py-2 font-mono">{p.partNumber}</td>
									<td class="px-4 py-2 text-gray-600 text-xs">
										{#if p.payload?.priceCents !== undefined}Price → {money(Number(p.payload.priceCents))}{/if}
										{#if p.payload?.quantityDelta !== undefined}+{p.payload.quantityDelta} stock{/if}
										{#if p.payload?.reason}{p.payload.reason}{/if}
										{#if p.payload?.partName && p.payload?.priceCents === undefined}{p.payload.partName}{/if}
									</td>
									<td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{new Date(p.submittedAt).toLocaleString()}</td>
									<td class="px-4 py-2">
										<span class="text-xs px-2 py-0.5 rounded-full {statusClass(p.status)}">{p.status}</span>
										{#if p.status === 'rejected' && p.rejectionReason}<div class="text-xs text-red-600 mt-1">{p.rejectionReason}</div>{/if}
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
</div>

<!-- Edit modal -->
{#if editItem}
	<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
		<div class="bg-white rounded-lg max-w-lg w-full">
			<div class="p-4 border-b flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Edit {editItem.partNumber}</h2>
				<button class="text-gray-400 hover:text-gray-600 text-2xl leading-none" on:click={closeAll}>×</button>
			</div>
			<form method="POST" action="?/editItem" use:enhance={() => async ({ update }) => { await update(); closeAll(); }} class="p-4 space-y-3">
				<input type="hidden" name="partNumber" value={editItem.partNumber} />
				<input type="hidden" name="nrsPartId" value={editItem.invStockId} />
				<input type="hidden" name="prevPriceDollars" value={editItem.retailPrice.toFixed(2)} />
				<input type="hidden" name="prevDescription" value={editItem.description ?? editItem.name ?? ''} />
				<div>
					<label class="label" for="edit-desc">Description</label>
					<input id="edit-desc" name="description" type="text" class="input" bind:value={editDescription} />
				</div>
				<div>
					<label class="label" for="edit-price">Price ($)</label>
					<input id="edit-price" name="priceDollars" type="number" step="0.01" min="0" class="input" bind:value={editPrice} />
					<p class="text-xs text-gray-500 mt-1">A price change queues a fresh tag to print at the new price.</p>
				</div>
				<div class="flex justify-end gap-2 pt-2 border-t">
					<button type="button" class="btn btn-secondary" on:click={closeAll}>Cancel</button>
					<button type="submit" class="btn btn-primary">Save to NRS</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Add stock modal -->
{#if stockItem}
	<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
		<div class="bg-white rounded-lg max-w-md w-full">
			<div class="p-4 border-b flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Add stock — {stockItem.partNumber}</h2>
				<button class="text-gray-400 hover:text-gray-600 text-2xl leading-none" on:click={closeAll}>×</button>
			</div>
			<form method="POST" action="?/addStock" use:enhance={() => async ({ update }) => { await update(); closeAll(); }} class="p-4 space-y-3">
				<input type="hidden" name="partNumber" value={stockItem.partNumber} />
				<input type="hidden" name="nrsPartId" value={stockItem.invStockId} />
				<input type="hidden" name="description" value={stockItem.description ?? stockItem.name ?? ''} />
				<input type="hidden" name="priceDollars" value={stockItem.retailPrice.toFixed(2)} />
				<p class="text-sm text-gray-600">Currently on hand: <strong>{stockItem.quantityOnHand}</strong></p>
				<div>
					<label class="label" for="add-qty">Add how many?</label>
					<input id="add-qty" name="addQty" type="number" step="1" min="1" max="500" class="input" bind:value={addQty} />
					<p class="text-xs text-gray-500 mt-1">Queues that many tags to print.</p>
				</div>
				<div class="flex justify-end gap-2 pt-2 border-t">
					<button type="button" class="btn btn-secondary" on:click={closeAll}>Cancel</button>
					<button type="submit" class="btn btn-primary">Add stock</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Deactivate modal -->
{#if deactItem}
	<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
		<div class="bg-white rounded-lg max-w-md w-full">
			<div class="p-4 border-b flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Deactivate {deactItem.partNumber}</h2>
				<button class="text-gray-400 hover:text-gray-600 text-2xl leading-none" on:click={closeAll}>×</button>
			</div>
			<form method="POST" action="?/deactivate" use:enhance={() => async ({ update }) => { await update(); closeAll(); }} class="p-4 space-y-3">
				<input type="hidden" name="partNumber" value={deactItem.partNumber} />
				<input type="hidden" name="nrsPartId" value={deactItem.invStockId} />
				<p class="text-sm text-gray-700">Marks the item inactive in NRS. It's kept in records (never deleted) and drops off the active catalog. Use this when it's no longer for sale.</p>
				<div>
					<label class="label" for="deact-reason">Reason <span class="text-red-600">*</span></label>
					<textarea id="deact-reason" name="reason" rows="2" class="input" required bind:value={deactReason} placeholder="Took it home, sold elsewhere, donated…"></textarea>
				</div>
				<div class="flex justify-end gap-2 pt-2 border-t">
					<button type="button" class="btn btn-secondary" on:click={closeAll}>Cancel</button>
					<button type="submit" class="btn btn-danger">Deactivate</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Bulk price modal -->
{#if bulkOpen}
	<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
		<div class="bg-white rounded-lg max-w-lg w-full">
			<div class="p-4 border-b flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Change price — {selectedItems.length} items</h2>
				<button class="text-gray-400 hover:text-gray-600 text-2xl leading-none" on:click={closeAll}>×</button>
			</div>
			<form method="POST" action="?/bulkPrice" use:enhance={() => async ({ update }) => { await update(); clearSelection(); closeAll(); }} class="p-4 space-y-3">
				{#each selectedItems as i}
					<input type="hidden" name="selected" value={`${i.invStockId}|${i.partNumber}|${Math.round(i.retailPrice * 100)}|${(i.description ?? i.name ?? '').replace(/\|/g, ' ')}`} />
				{/each}
				<div class="flex gap-4 text-sm">
					<label class="flex items-center gap-1"><input type="radio" name="mode" value="percent" bind:group={bulkMode} /> Reduce by %</label>
					<label class="flex items-center gap-1"><input type="radio" name="mode" value="set" bind:group={bulkMode} /> Set price to $</label>
				</div>
				<div>
					<label class="label" for="bulk-amount">{bulkMode === 'percent' ? 'Percent off' : 'New price ($)'}</label>
					<input id="bulk-amount" name="amount" type="number" step="0.01" min="0" class="input" bind:value={bulkAmount} placeholder={bulkMode === 'percent' ? '15' : '9.99'} />
				</div>
				<p class="text-xs text-gray-500">Each item updates in NRS and gets a fresh tag queued at the new price.</p>
				<div class="flex justify-end gap-2 pt-2 border-t">
					<button type="button" class="btn btn-secondary" on:click={closeAll}>Cancel</button>
					<button type="submit" class="btn btn-primary">Apply to {selectedItems.length} items</button>
				</div>
			</form>
		</div>
	</div>
{/if}
