<!--
  VendorTabs — switch between the vendor accounts a portal login may act for:
  the parent (primary) and its NRS pass-through children. Rendered only when
  there is more than one. Selection travels as ?v=<vendor id>.
-->
<script lang="ts">
	import { page } from '$app/stores';
	export let members: { id: string; displayName: string; inventoryCodePrefix: string | null; isPrimary: boolean }[];
	export let selectedId: string;
	$: base = $page.url.pathname;
	$: primary = members.find((x) => x.isPrimary);
</script>

{#if members.length > 1}
	<div class="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Vendor account">
		{#each members as m (m.id)}
			<a
				role="tab"
				aria-selected={m.id === selectedId}
				href={m.isPrimary ? base : `${base}?v=${m.id}`}
				class="px-3 py-1.5 text-sm rounded-full border transition-colors {m.id === selectedId ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
			>
				<span class="font-mono">{m.inventoryCodePrefix ?? m.displayName}</span>
				{#if !m.isPrimary}<span class="ml-1 text-xs opacity-80">paid via {primary?.inventoryCodePrefix ?? 'parent'}</span>{/if}
			</a>
		{/each}
	</div>
{/if}
