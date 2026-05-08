<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
</script>

<svelte:head><title>Profile — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-2xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-900">Profile</h1>

	<div class="card mt-6">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Account</h2></div>
		<div class="card-body grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
			<div>
				<div class="text-xs text-gray-500">Vendor name</div>
				<div class="font-medium">{data.vendor.displayName}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Contact name</div>
				<div>{data.vendor.contactName ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Email</div>
				<div>{data.vendor.contactEmail ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Phone</div>
				<div>{data.vendor.contactPhone ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Inventory prefix</div>
				<div class="font-mono">{data.vendor.inventoryCodePrefix ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Status</div>
				<div>{data.vendor.status}</div>
			</div>
		</div>
		<div class="card-body border-t border-gray-100 text-xs text-gray-500">
			Need to update your contact info? Ask the shop.
		</div>
	</div>

	<div class="card mt-4">
		<div class="card-header">
			<h2 class="font-semibold text-gray-900">On file at NRS</h2>
			<p class="text-xs text-gray-500 mt-1">What the POS has for your booth right now. If anything's wrong, ask the shop to update it in NRS — TeamTime mirrors what's there.</p>
		</div>
		<div class="card-body text-sm">
			{#if !data.vendor.nrsVendorId}
				<p class="text-gray-500">Your account isn't linked to NRS yet.</p>
			{:else if data.nrsError}
				<p class="text-red-600">Couldn't reach NRS: {data.nrsError}</p>
			{:else if !data.nrsDetail}
				<p class="text-gray-500">No record found in NRS for vendor #{data.vendor.nrsVendorId}.</p>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-gray-500">NRS Vendor ID</div>
						<div class="font-mono">{data.nrsDetail.vendorId}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500">SKU prefix (vendorCode)</div>
						<div class="font-mono">{data.nrsDetail.vendorCode || '—'}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500">Contact</div>
						<div>{data.nrsDetail.contact || '—'}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500">Email</div>
						<div>{data.nrsDetail.email || '—'}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500">Phone</div>
						<div>{data.nrsDetail.phone || '—'}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500">Vendor #</div>
						<div>{data.nrsDetail.vendorNumber || '—'}</div>
					</div>
					<div class="md:col-span-2">
						<div class="text-xs text-gray-500">Address</div>
						<div>
							{[data.nrsDetail.address, data.nrsDetail.address2, data.nrsDetail.address3].filter(Boolean).join(' ') || '—'}
							{#if data.nrsDetail.city || data.nrsDetail.state || data.nrsDetail.zipCode}
								<div>{[data.nrsDetail.city, data.nrsDetail.state].filter(Boolean).join(', ')} {data.nrsDetail.zipCode}</div>
							{/if}
						</div>
					</div>
					{#if data.nrsDetail.notes}
						<div class="md:col-span-2">
							<div class="text-xs text-gray-500">Notes</div>
							<div class="whitespace-pre-wrap">{data.nrsDetail.notes}</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="card mt-4">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Change password</h2></div>
		<div class="card-body">
			{#if form?.error}
				<div class="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
			{/if}
			{#if form?.success}
				<div class="mb-3 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Password updated.</div>
			{/if}
			<form method="POST" action="?/changePassword" use:enhance class="space-y-3 max-w-md">
				<div>
					<label class="label" for="currentPassword">Current password</label>
					<input id="currentPassword" name="currentPassword" type="password" class="input" bind:value={currentPassword} required />
				</div>
				<div>
					<label class="label" for="newPassword">New password</label>
					<input id="newPassword" name="newPassword" type="password" class="input" minlength="8" bind:value={newPassword} required />
				</div>
				<div>
					<label class="label" for="confirmPassword">Confirm new password</label>
					<input id="confirmPassword" name="confirmPassword" type="password" class="input" minlength="8" bind:value={confirmPassword} required />
				</div>
				<button type="submit" class="btn btn-primary">Update password</button>
			</form>
		</div>
	</div>
</div>
