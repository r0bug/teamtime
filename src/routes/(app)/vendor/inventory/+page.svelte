<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	type Mode = 'create' | 'update' | 'delete';

	let modalOpen = false;
	let mode: Mode = 'create';
	let editingNrsPartId: number | null = null;
	let editingPreviousPayload: Record<string, unknown> | null = null;

	let partNumber = '';
	let partName = '';
	let description = '';
	let priceDollars = '';
	let quantity = '';

	function openCreate() {
		mode = 'create';
		editingNrsPartId = null;
		editingPreviousPayload = null;
		partNumber = data.vendor.inventoryCodePrefix ?? '';
		partName = '';
		description = '';
		priceDollars = '';
		quantity = '';
		modalOpen = true;
	}

	function openUpdate(item: typeof data.soldItems[0]) {
		mode = 'update';
		editingNrsPartId = item.nrsPartId;
		editingPreviousPayload = {
			partName: item.partName,
			lastPrice: item.lastPrice,
			unitsSold: item.unitsSold
		};
		partNumber = item.partNumber;
		partName = item.partName ?? '';
		description = '';
		priceDollars = item.lastPrice ? item.lastPrice.toFixed(2) : '';
		quantity = '';
		modalOpen = true;
	}

	function openDelete(item: typeof data.soldItems[0]) {
		mode = 'delete';
		editingNrsPartId = item.nrsPartId;
		editingPreviousPayload = { partName: item.partName, lastPrice: item.lastPrice };
		partNumber = item.partNumber;
		partName = item.partName ?? '';
		description = '';
		priceDollars = '';
		quantity = '';
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
	<div class="flex items-center justify-between flex-wrap gap-2">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">My Inventory</h1>
			<p class="text-sm text-gray-600 mt-1">
				{#if data.vendor.inventoryCodePrefix}
					All your item codes start with <code class="font-mono font-semibold">{data.vendor.inventoryCodePrefix}</code>.
				{:else}
					Your inventory prefix isn't set. Ask the shop to configure it before submitting changes.
				{/if}
			</p>
		</div>
		<button class="btn btn-primary" on:click={openCreate} disabled={!data.vendor.inventoryCodePrefix}>
			+ Add new item
		</button>
	</div>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form?.success === 'submit'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Change submitted. Staff will review and apply it to NRS.</div>
	{/if}
	{#if form?.success === 'cancel'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Change cancelled.</div>
	{/if}

	<!-- Pending changes -->
	<section class="mt-6">
		<h2 class="font-semibold text-gray-900 mb-2">My pending changes</h2>
		{#if data.pending.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No pending changes.</div></div>
		{:else}
			<div class="card">
				<div class="card-body p-0">
					<table class="w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700">Type</th>
								<th class="px-4 py-2 font-medium text-gray-700">Part #</th>
								<th class="px-4 py-2 font-medium text-gray-700">Name</th>
								<th class="px-4 py-2 font-medium text-gray-700">Submitted</th>
								<th class="px-4 py-2 font-medium text-gray-700">Status</th>
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
									<td class="px-4 py-2 text-right">
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
		<p class="text-xs text-gray-500 mb-2">Derived from your NRS sales history. Use these as a starting point to propose updates.</p>
		{#if !data.vendor.nrsVendorId}
			<div class="card"><div class="card-body text-sm text-gray-500">Not linked to NRS yet — staff needs to set your NRS vendor ID.</div></div>
		{:else if data.soldItems.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No sales found yet for your booth.</div></div>
		{:else}
			<div class="card">
				<div class="card-body p-0">
					<table class="w-full text-sm">
						<thead class="bg-gray-50 text-left">
							<tr>
								<th class="px-4 py-2 font-medium text-gray-700">Part #</th>
								<th class="px-4 py-2 font-medium text-gray-700">Name</th>
								<th class="px-4 py-2 font-medium text-gray-700">Last sold</th>
								<th class="px-4 py-2 font-medium text-gray-700">Units</th>
								<th class="px-4 py-2 font-medium text-gray-700">Last price</th>
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
										<button type="button" class="text-primary-600 hover:underline mr-3 text-sm" on:click={() => openUpdate(item)}>Propose update</button>
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
				<h2 class="text-lg font-semibold text-gray-900">
					{#if mode === 'create'}Add new item{:else if mode === 'update'}Propose update{:else}Remove item{/if}
				</h2>
				<button class="text-gray-400 hover:text-gray-600 text-2xl leading-none" on:click={closeModal}>×</button>
			</div>
			<form method="POST" action="?/submit" use:enhance={() => () => { closeModal(); }} class="p-4 space-y-3">
				<input type="hidden" name="changeType" value={mode} />
				{#if editingNrsPartId !== null}
					<input type="hidden" name="nrsPartId" value={editingNrsPartId} />
				{/if}
				{#if editingPreviousPayload}
					<input type="hidden" name="previousPayload" value={JSON.stringify(editingPreviousPayload)} />
				{/if}

				<div>
					<label class="label" for="partNumber">Part number</label>
					<input id="partNumber" name="partNumber" type="text" class="input font-mono uppercase" required bind:value={partNumber} readonly={mode !== 'create'} />
					{#if mode === 'create' && data.vendor.inventoryCodePrefix}
						<p class="text-xs text-gray-500 mt-1">Must start with <code>{data.vendor.inventoryCodePrefix}</code>.</p>
					{/if}
				</div>

				{#if mode !== 'delete'}
					<div>
						<label class="label" for="partName">Item name</label>
						<input id="partName" name="partName" type="text" class="input" bind:value={partName} required={mode === 'create'} />
					</div>

					<div>
						<label class="label" for="description">Description</label>
						<textarea id="description" name="description" rows="2" class="input" bind:value={description}></textarea>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="label" for="priceDollars">Price ($)</label>
							<input id="priceDollars" name="priceDollars" type="number" step="0.01" class="input" bind:value={priceDollars} />
						</div>
						<div>
							<label class="label" for="quantity">Quantity</label>
							<input id="quantity" name="quantity" type="number" class="input" bind:value={quantity} />
						</div>
					</div>
				{:else}
					<p class="text-sm text-gray-700">This will request that staff remove <strong class="font-mono">{partNumber}</strong> from NRS.</p>
				{/if}

				<div class="flex justify-end gap-2 pt-2 border-t border-gray-200">
					<button type="button" class="btn btn-secondary" on:click={closeModal}>Cancel</button>
					<button type="submit" class="btn btn-primary">Submit for review</button>
				</div>
			</form>
		</div>
	</div>
{/if}
