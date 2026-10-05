<script lang="ts">
	import VendorFloorView from '$lib/components/floorplan/VendorFloorView.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head><title>{data.vendor.displayName} on the floorplan - TeamTime Vendors</title></svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<a href="/admin/vendors/{data.vendor.id}" class="text-sm text-primary-600 hover:underline">← Back to {data.vendor.displayName}</a>

	<div class="mt-2 mb-4">
		<h1 class="text-2xl font-bold text-gray-900">{data.vendor.displayName} on the floor</h1>
		<p class="text-sm text-gray-600 mt-1">
			{#if data.vendor.boothNumber}Booth {data.vendor.boothNumber} · {/if}
			{#if data.vendor.nrsVendorId}NRS #{data.vendor.nrsVendorId} · {/if}
			Read-only view. To move or resize the booth, use the
			<a href="/floorplan{data.plan ? `?plan=${data.plan.id}` : ''}" class="text-primary-600 hover:underline">floorplan editor</a>.
		</p>
	</div>

	<VendorFloorView
		plans={data.plans}
		plan={data.plan}
		cells={data.cells}
		attrDefs={data.attrDefs}
		boothKeys={data.boothKeys}
		pools={data.pools}
		linked={data.vendor.nrsVendorId !== null}
		planHrefBase="/admin/vendors/{data.vendor.id}/floorplan"
		showPopover
		emptyBoothMessage="No cells are painted for this vendor on {data.plan?.name ?? 'this plan'}. Paint them in the floorplan editor."
	/>
</div>
