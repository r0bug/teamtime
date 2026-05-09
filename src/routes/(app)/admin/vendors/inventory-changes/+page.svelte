<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	const tabs: { id: typeof data.status; label: string; count: keyof typeof data.counts }[] = [
		{ id: 'pending', label: 'Pending', count: 'pending' },
		{ id: 'applied', label: 'Applied', count: 'applied' },
		{ id: 'rejected', label: 'Rejected', count: 'rejected' },
		{ id: 'cancelled', label: 'Cancelled', count: 'cancelled' }
	];

	let openId: string | null = null;
	function toggleOpen(id: string) {
		openId = openId === id ? null : id;
	}

	function summarizePayload(p: Record<string, unknown> | null | undefined): string {
		if (!p) return '';
		const parts: string[] = [];
		if (p.partName) parts.push(`name: ${p.partName}`);
		if (p.priceCents !== undefined && p.priceCents !== null) parts.push(`$${(Number(p.priceCents) / 100).toFixed(2)}`);
		if (p.quantity !== undefined && p.quantity !== null) parts.push(`qty: ${p.quantity}`);
		if (p.description) parts.push(`desc: ${String(p.description).slice(0, 40)}…`);
		return parts.join(' · ');
	}
</script>

<svelte:head><title>Inventory Changes - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<div class="mt-2 flex items-start justify-between gap-3 flex-wrap">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Inventory Change Queue</h1>
			<p class="text-gray-600 text-sm mt-1">Vendor-proposed NRS changes. Apply to NRS manually, then mark applied here.</p>
		</div>
		{#if data.status === 'pending' && data.counts.pending > 0}
			<div class="flex gap-2 flex-wrap">
				<a
					href="/api/admin/inventory-changes/nrs-import-csv?changeType=create"
					class="btn btn-secondary"
					title="Download a CSV matching NRS ImportInv template — upload it at https://www.nrsaccounting.com/import/type/ImportInv">
					⬇ Download CSV
				</a>
				<form method="POST" action="?/autoApply" use:enhance>
					<button
						type="submit"
						class="btn btn-primary"
						title="Logs in to NRS and submits the importer form for you. Faster but brittle to NRS UI changes.">
						🤖 Auto-apply via NRS
					</button>
				</form>
			</div>
		{/if}
	</div>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form && 'autoApplyResults' in form && form.autoApplyResults}
		<div class="mt-4 space-y-2">
			{#each form.autoApplyResults as r (r.vendorId)}
				<div class="p-3 rounded text-sm border {r.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-900'}">
					<strong>{r.vendorDisplayName}</strong> ({r.rowCount} row{r.rowCount === 1 ? '' : 's'}):
					{#if r.ok}
						✓ applied{#if r.fileId} — NRS file #{r.fileId}{/if}{#if r.appliedChangeIds.length}, {r.appliedChangeIds.length} marked{/if}
					{:else if r.error}
						✗ {r.error}
					{:else}
						⚠ submitted but couldn't confirm success — {r.messages.length ? r.messages.join(' / ') : 'no message'}. Check NRS manually.
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div class="mt-6 border-b border-gray-200">
		<nav class="flex gap-4 -mb-px text-sm">
			{#each tabs as t (t.id)}
				<a href={`/admin/vendors/inventory-changes?status=${t.id}`}
					class="py-3 border-b-2 {data.status === t.id ? 'border-primary-600 text-primary-600 font-semibold' : 'border-transparent text-gray-600'}">
					{t.label}
					<span class="ml-1 text-xs px-1.5 py-0.5 bg-gray-100 rounded">{data.counts[t.count]}</span>
				</a>
			{/each}
		</nav>
	</div>

	<div class="mt-4 space-y-3">
		{#each data.rows as row (row.id)}
			<div class="card">
				<div class="card-body">
					<div class="flex items-start justify-between gap-3 flex-wrap">
						<div>
							<div class="text-sm">
								<span class="text-xs uppercase font-semibold text-gray-500 mr-2">{row.changeType}</span>
								<span class="font-mono">{row.partNumber}</span>
								<span class="text-gray-500 mx-2">·</span>
								<a href={`/admin/vendors/${row.vendorId}`} class="text-primary-600 hover:underline">{row.vendorDisplayName}</a>
							</div>
							<div class="text-xs text-gray-500 mt-1">
								Submitted by {row.submittedByName} · {new Date(row.submittedAt).toLocaleString()}
							</div>
							<div class="text-sm text-gray-700 mt-2">{summarizePayload(row.payload)}</div>
							{#if row.previousPayload}
								<div class="text-xs text-gray-500 mt-1">prior: {summarizePayload(row.previousPayload)}</div>
							{/if}
							{#if row.status === 'rejected' && row.rejectionReason}
								<div class="text-xs text-red-600 mt-1">Rejected: {row.rejectionReason}</div>
							{/if}
							{#if row.status === 'applied' && row.nrsApplyNotes}
								<div class="text-xs text-gray-500 mt-1">Notes: {row.nrsApplyNotes}</div>
							{/if}
						</div>
						{#if data.status === 'pending'}
							<div class="flex gap-2">
								<button class="btn btn-secondary text-sm" on:click={() => toggleOpen(row.id)}>
									{openId === row.id ? 'Close' : 'Review'}
								</button>
							</div>
						{/if}
					</div>

					{#if openId === row.id && data.status === 'pending'}
						<div class="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
							<form method="POST" action="?/apply" use:enhance class="space-y-2">
								<input type="hidden" name="id" value={row.id} />
								<label class="label text-xs" for={`notes-${row.id}`}>NRS apply notes (optional)</label>
								<input id={`notes-${row.id}`} name="nrsApplyNotes" type="text" class="input text-sm" placeholder="What you did in NRS" />
								<button type="submit" class="btn btn-primary w-full">Mark applied</button>
							</form>
							<form method="POST" action="?/reject" use:enhance class="space-y-2">
								<input type="hidden" name="id" value={row.id} />
								<label class="label text-xs" for={`reason-${row.id}`}>Rejection reason</label>
								<input id={`reason-${row.id}`} name="reason" type="text" class="input text-sm" required placeholder="Why this can't be applied" />
								<button type="submit" class="btn btn-danger w-full">Reject</button>
							</form>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="card"><div class="card-body text-sm text-gray-500 text-center py-8">No {data.status} changes.</div></div>
		{/each}
	</div>
</div>
