<script lang="ts">
	import VendorFloorView from '$lib/components/floorplan/VendorFloorView.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head><title>My Booth — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-900">My Booth</h1>
	<p class="text-gray-600 text-sm mt-1">
		Your space on the shop floor is highlighted. Questions about your booth location or size? Ask the front desk.
	</p>

	<div class="mt-4">
		<VendorFloorView
			plans={data.plans}
			plan={data.plan}
			cells={data.cells}
			attrDefs={data.attrDefs}
			boothKeys={data.boothKeys}
			pools={data.pools}
			linked={data.vendor.nrsVendorId !== null}
			planHrefBase="/vendor/floorplan"
			emptyBoothMessage="Your booth hasn't been marked on the floorplan yet. Staff will add it soon."
			unlinkedMessage="Your account isn't connected to the register system yet, so your booth can't be shown. Ask the front desk."
		/>
	</div>
</div>
