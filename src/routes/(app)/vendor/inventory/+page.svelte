<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import {
		printPartNumber,
		isAvailable as isZebraAvailable,
		BROWSER_PRINT_DOWNLOAD_URL,
		ZebraPrintError
	} from '$lib/utils/zebra-print-client';
	import { onMount } from 'svelte';

	export let data: PageData;
	export let form: ActionData;

	type Mode = 'create' | 'delete';

	let zebraReady: 'unknown' | 'yes' | 'no' = 'unknown';
	let zebraBusyFor: string | null = null;
	let zebraStatus: { partNumber: string; ok: boolean; message: string } | null = null;

	onMount(async () => {
		zebraReady = (await isZebraAvailable()) ? 'yes' : 'no';
	});

	async function printOnZebra(partNumber: string) {
		zebraBusyFor = partNumber;
		zebraStatus = null;
		try {
			await printPartNumber(partNumber);
			zebraStatus = { partNumber, ok: true, message: `Sent ${partNumber} to Zebra.` };
			zebraReady = 'yes';
		} catch (err) {
			const message =
				err instanceof ZebraPrintError ? err.message : err instanceof Error ? err.message : 'Print failed';
			zebraStatus = { partNumber, ok: false, message };
			if (err instanceof ZebraPrintError && /not running|install/i.test(message)) {
				zebraReady = 'no';
			}
		} finally {
			zebraBusyFor = null;
		}
	}

	let modalOpen = false;
	let mode: Mode = 'create';
	let editingNrsPartId: number | null = null;
	let editingPreviousPayload: Record<string, unknown> | null = null;

	let partNumber = '';
	let partName = '';
	let description = '';
	let priceDollars = '';
	let quantity = '';
	let reason = '';

	function openCreate() {
		mode = 'create';
		editingNrsPartId = null;
		editingPreviousPayload = null;
		partNumber = data.vendor.inventoryCodePrefix ?? '';
		partName = '';
		description = '';
		priceDollars = '';
		quantity = '';
		reason = '';
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
		{#if form.applied}
			<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">✓ New item created in NRS.</div>
		{:else if form.applyError}
			<div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-sm">Item saved and queued — staff will apply it to NRS shortly.</div>
		{:else if form.changeType === 'delete'}
			<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Removal requested. Staff will confirm the item isn't still on the sales floor before removing it from NRS.</div>
		{:else}
			<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Change submitted. Staff will review and apply it to NRS.</div>
		{/if}
	{/if}
	{#if form?.success === 'cancel'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Change cancelled.</div>
	{/if}
	{#if form?.success === 'quickTag'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm flex items-center justify-between gap-2 flex-wrap">
			<span>{form.applied ? '✓ Tag created in NRS.' : '✓ Tag queued (staff will apply to NRS).'} Code: <code class="font-mono font-semibold">{form.partNumber}</code> — "{form.description}" — ${(Number(form.priceCents) / 100).toFixed(2)}</span>
			<button
				type="button"
				class="btn btn-secondary text-xs whitespace-nowrap"
				on:click={() => printOnZebra(String(form.partNumber))}
				disabled={zebraBusyFor === String(form.partNumber)}>
				{zebraBusyFor === String(form.partNumber) ? 'Sending…' : '🦓 Print on Zebra'}
			</button>
		</div>
	{/if}

	{#if zebraStatus}
		<div class="mt-3 p-3 rounded text-sm border {zebraStatus.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}">
			{zebraStatus.ok ? '✓' : '⚠'} {zebraStatus.message}
		</div>
	{/if}

	{#if zebraReady === 'no'}
		<div class="mt-4 p-3 rounded text-sm bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 flex-wrap">
			<span class="text-2xl leading-none">🦓</span>
			<div class="flex-1 min-w-[200px]">
				<strong>Zebra Browser Print not detected.</strong>
				<p class="mt-1 text-amber-800">Install it once on this computer to print directly to your Zebra label printer. Free, signed by Zebra, Mac + Windows.</p>
			</div>
			<a href={BROWSER_PRINT_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" class="btn btn-secondary text-xs whitespace-nowrap">⬇ Download</a>
		</div>
	{/if}

	<!-- Quick tag — fastest path: description + price → auto-generated barcode -->
	{#if data.vendor.inventoryCodePrefix}
		<section class="mt-6">
			<div class="card">
				<div class="card-header">
					<h2 class="font-semibold text-gray-900">Make a tag</h2>
					<p class="text-xs text-gray-500 mt-1">
						Type the description and price. We'll generate a barcode like <code class="font-mono">{data.vendor.inventoryCodePrefix}YYYYMMDD0001</code> and queue it for the shop to add to NRS.
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
										{#if p.changeType !== 'delete'}
											<button
												type="button"
												class="text-primary-600 hover:underline text-sm mr-3 disabled:opacity-50"
												on:click={() => printOnZebra(p.partNumber)}
												disabled={zebraBusyFor === p.partNumber}>
												{zebraBusyFor === p.partNumber ? 'Sending…' : '🦓 Zebra'}
											</button>
										{/if}
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
										<button
											type="button"
											class="text-primary-600 hover:underline mr-3 text-sm disabled:opacity-50"
											on:click={() => printOnZebra(item.partNumber)}
											disabled={zebraBusyFor === item.partNumber}>
											{zebraBusyFor === item.partNumber ? 'Sending…' : '🦓 Zebra'}
										</button>
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
					{#if mode === 'create'}Add new item{:else}Remove item{/if}
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

				{#if mode === 'create'}
					<div>
						<label class="label" for="partName">Item name</label>
						<input id="partName" name="partName" type="text" class="input" bind:value={partName} required />
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
					<p class="text-sm text-gray-700">This requests that staff remove <strong class="font-mono">{partNumber}</strong> from NRS. Staff will confirm it's off the sales floor first.</p>
					<div>
						<label class="label" for="reason">Reason for removal <span class="text-red-600">*</span></label>
						<textarea id="reason" name="reason" rows="2" class="input" required bind:value={reason} placeholder="e.g. Took it home, donated, no longer for sale"></textarea>
					</div>
				{/if}

				<div class="flex justify-end gap-2 pt-2 border-t border-gray-200">
					<button type="button" class="btn btn-secondary" on:click={closeModal}>Cancel</button>
					<button type="submit" class="btn {mode === 'delete' ? 'btn-danger' : 'btn-primary'}">{mode === 'delete' ? 'Request removal' : 'Submit'}</button>
				</div>
			</form>
		</div>
	</div>
{/if}
