<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';

	export let data: PageData;
	export let form: ActionData;

	let status = data.filters.status;
	let search = data.filters.search;
	let showInactive = data.filters.includeNrsInactive;

	function applyFilters() {
		const params = new URLSearchParams();
		if (status) params.set('status', status);
		if (search) params.set('q', search);
		if (showInactive) params.set('showInactive', '1');
		const qs = params.toString();
		goto(`/admin/vendors${qs ? `?${qs}` : ''}`, { keepFocus: true });
	}

	function formatRent(cents: number | null): string {
		if (cents === null) return '—';
		return `$${(cents / 100).toFixed(2)}/mo`;
	}
</script>

<svelte:head><title>Vendors - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Vendors</h1>
			<p class="text-gray-600 mt-1">{data.vendors.length} vendor{data.vendors.length === 1 ? '' : 's'}</p>
		</div>
		<div class="flex gap-2 flex-wrap">
			<a href="/admin/vendors/leaderboard" class="btn btn-secondary">📊 Performance</a>
			<a href="/admin/vendors/inventory-changes" class="btn btn-secondary">Changes Queue</a>
			<a href="/admin/vendor-groups" class="btn btn-secondary">Groups</a>
			<form method="POST" action="?/removeStubs" use:enhance>
				<button type="submit" class="btn btn-secondary" title="Delete inactive vendor rows that have no sales, no agreements, and no portal access">Remove unused stubs</button>
			</form>
			<form method="POST" action="?/syncNrs" use:enhance>
				<button type="submit" class="btn btn-primary">Sync from NRS</button>
			</form>
		</div>
	</div>

	{#if form && 'syncResult' in form && form.syncResult}
		<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
			NRS sync: created {form.syncResult.created}, enriched {form.syncResult.enriched ?? 0}, filtered out {form.syncResult.filteredOut ?? 0}, skipped {form.syncResult.skipped}{form.syncResult.prefixCollisions ? `, ${form.syncResult.prefixCollisions} prefix collision${form.syncResult.prefixCollisions === 1 ? '' : 's'}` : ''}.
		</div>
	{/if}
	{#if form && 'stubsResult' in form && form.stubsResult}
		<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
			Cleanup: removed {form.stubsResult.removed} unused stub{form.stubsResult.removed === 1 ? '' : 's'}, kept {form.stubsResult.kept} inactive vendor{form.stubsResult.kept === 1 ? '' : 's'}.
		</div>
	{/if}
	{#if form?.error}
		<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form && 'csvResult' in form && form.csvResult}
		<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
			CSV import: parsed {form.csvResult.parsed} rows ({form.csvResult.unique} unique) → updated {form.csvResult.updated}, no-change {form.csvResult.noChange}, missed {form.csvResult.missed}{form.csvResult.missed > 0 ? ` (${form.csvResult.missedCodes.slice(0, 5).join(', ')}${form.csvResult.missedCodes.length > 5 ? '…' : ''})` : ''}.
			{#if form.csvResult.inactiveDeleted > 0 || form.csvResult.inactiveKept > 0}
				<div class="mt-1">
					Inactive cleanup: deleted {form.csvResult.inactiveDeleted}, kept {form.csvResult.inactiveKept}{form.csvResult.inactiveKept > 0 ? ' (have agreements / portal / linked user)' : ''}.
				</div>
			{/if}
		</div>
	{/if}
	{#if data.needsOnboardingCount > 0}
		<div class="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded text-sm flex items-center justify-between">
			<span>{data.needsOnboardingCount} vendor{data.needsOnboardingCount === 1 ? '' : 's'} need{data.needsOnboardingCount === 1 ? 's' : ''} onboarding (prefix, group, or portal access).</span>
			<a href="/admin/vendors/onboarding" class="font-semibold underline">Open onboarding queue →</a>
		</div>
	{/if}

	<details class="card mb-4">
		<summary class="card-body cursor-pointer text-sm font-medium">
			📋 Paste NRS vendor CSV export to backfill rent + payment %
		</summary>
		<div class="card-body border-t border-gray-100">
			<form method="POST" action="?/importCsv" use:enhance class="space-y-3">
				<p class="text-xs text-gray-500">
					Paste the full NRS vendor grid export (CSV with header row). Match is by <code>Vendor ID</code> column → TT <code>inventoryCodePrefix</code>. Only fills blanks — never overwrites values you've already set.
				</p>
				<textarea
					name="csv"
					rows="6"
					class="input font-mono text-xs"
					placeholder="Vendor ID,Name,Contact,Phone,A/R Customer,Pass-Through Vendor Payment %,Booth Rent,..."
				></textarea>
				<div class="flex justify-end">
					<button type="submit" class="btn btn-primary">Apply CSV</button>
				</div>
			</form>
		</div>
	</details>

	<div class="card mb-4">
		<div class="card-body grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
			<div>
				<label class="label" for="search">Search</label>
				<input id="search" type="text" class="input" bind:value={search} placeholder="Name, booth, contact..." />
			</div>
			<div>
				<label class="label" for="status">Status</label>
				<select id="status" class="input" bind:value={status}>
					<option value="">All</option>
					<option value="active">Active</option>
					<option value="inactive">Inactive</option>
					<option value="terminated">Terminated</option>
				</select>
			</div>
			<label class="flex items-center gap-2 text-sm pb-2">
				<input type="checkbox" bind:checked={showInactive} />
				Show NRS-inactive ({data.nrsInactiveCount})
			</label>
			<button type="button" class="btn btn-primary" on:click={applyFilters}>Apply</button>
		</div>
	</div>

	<div class="card">
		<div class="card-body p-0">
			<table class="w-full text-sm">
				<thead class="bg-gray-50 text-left">
					<tr>
						<th class="px-4 py-2 font-medium text-gray-700">Vendor</th>
						<th class="px-4 py-2 font-medium text-gray-700">Vendor Code</th>
						<th class="px-4 py-2 font-medium text-gray-700">Rent</th>
						<th class="px-4 py-2 font-medium text-gray-700">Pay %</th>
						<th class="px-4 py-2 font-medium text-gray-700">Max Disc</th>
						<th class="px-4 py-2 font-medium text-gray-700">Primary Agreement</th>
						<th class="px-4 py-2 font-medium text-gray-700">Add-Ons</th>
						<th class="px-4 py-2 font-medium text-gray-700">NRS</th>
						<th class="px-4 py-2 font-medium text-gray-700">Status</th>
						<th class="px-4 py-2 font-medium text-gray-700">Edit in NRS</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.vendors as v (v.id)}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-2">
								<a class="text-primary-600 hover:underline font-medium" href={`/admin/vendors/${v.id}`}>{v.displayName}</a>
								{#if v.contactName}
									<div class="text-xs text-gray-500">{v.contactName}</div>
								{/if}
							</td>
							<td class="px-4 py-2 font-mono">{v.inventoryCodePrefix ?? '—'}</td>
							<td class="px-4 py-2">{formatRent(v.monthlyRentCents)}</td>
							<td class="px-4 py-2">{v.vendorPaymentPercent ? `${v.vendorPaymentPercent}%` : '—'}</td>
							<td class="px-4 py-2">{v.maxDiscountPercent ? `${v.maxDiscountPercent}%` : '—'}</td>
							<td class="px-4 py-2">
								{#if v.primaryAgreement}
									<div>{v.primaryAgreement.templateTitle}</div>
									<div class="text-xs text-gray-500">{new Date(v.primaryAgreement.signedAt).toLocaleDateString()}</div>
								{:else}
									<span class="text-red-600 text-xs">unsigned</span>
								{/if}
							</td>
							<td class="px-4 py-2">{v.activeAddonCount > 0 ? v.activeAddonCount : '—'}</td>
							<td class="px-4 py-2 text-xs font-mono text-gray-600">{v.nrsVendorId ?? '—'}</td>
							<td class="px-4 py-2">
								<span class="text-xs px-2 py-0.5 rounded-full {v.status === 'active' ? 'bg-green-100 text-green-700' : v.status === 'inactive' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}">{v.status}</span>
							</td>
							<td class="px-4 py-2">
								{#if v.nrsVendorId}
									<a
										href={`https://www.nrsaccounting.com/ap/apVendorManagement?form=${v.nrsVendorId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="text-primary-600 hover:underline text-sm"
										title="Open vendor edit page in NRS">↗ NRS</a>
								{:else}
									<span class="text-gray-400 text-sm">—</span>
								{/if}
							</td>
						</tr>
					{:else}
						<tr><td colspan="10" class="px-4 py-8 text-center text-gray-500">No vendors yet. Click "Sync from NRS" to import pass-through vendors.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
