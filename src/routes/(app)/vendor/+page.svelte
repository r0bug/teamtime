<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;
</script>

<svelte:head><title>{data.vendor.displayName} — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-900">Welcome, {data.vendor.contactName ?? data.vendor.displayName}</h1>
	<p class="text-gray-600 text-sm mt-1">Manage your inventory and view sales from your booth at the shop.</p>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
		<a href="/vendor/inventory" class="card hover:shadow-md transition-shadow">
			<div class="card-body">
				<div class="text-3xl font-bold text-gray-900">{data.changeCounts.pending}</div>
				<div class="text-sm text-gray-600">Pending inventory changes</div>
				<div class="text-xs text-gray-500 mt-2">Awaiting staff to apply to NRS</div>
			</div>
		</a>
		<a href="/vendor/sales" class="card hover:shadow-md transition-shadow">
			<div class="card-body">
				<div class="text-lg font-semibold text-gray-900">View sales</div>
				<div class="text-sm text-gray-600 mt-2">Recent sales pulled live from NRS</div>
			</div>
		</a>
		<a href="/vendor/profile" class="card hover:shadow-md transition-shadow">
			<div class="card-body">
				<div class="text-lg font-semibold text-gray-900">Account & password</div>
				<div class="text-sm text-gray-600 mt-2">Update your password</div>
			</div>
		</a>
	</div>

	<div class="card mt-6">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Your booth</h2></div>
		<div class="card-body grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
			<div>
				<div class="text-xs text-gray-500">Booth</div>
				<div class="font-medium">{data.vendor.boothNumber ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Inventory prefix</div>
				<div class="font-mono">{data.vendor.inventoryCodePrefix ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Monthly rent</div>
				<div>{data.vendor.monthlyRentCents !== null ? `$${(data.vendor.monthlyRentCents / 100).toFixed(2)}` : '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Max discount</div>
				<div>{data.vendor.maxDiscountPercent ?? '—'}{data.vendor.maxDiscountPercent ? '%' : ''}</div>
			</div>
		</div>
	</div>
</div>
