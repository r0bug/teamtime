<!--
  VendorCombobox - searchable "pick a vendor" input for the floorplan paint
  toolbar. Type part of a name or NRS id to filter; arrow keys + Enter select;
  Esc closes. `value` is the NRS vendor id as a string ('' = none).
-->
<script lang="ts">
	import { matchVendor, vendorHint, type VendorOption } from '$lib/floorplan/vendor-filter';

	export let vendors: VendorOption[] = [];
	export let value: string | null = '';
	export let placeholder = 'search vendor…';
	export let ariaLabel = 'Vendor';

	let query = '';
	let open = false;
	let highlight = 0;
	let inputEl: HTMLInputElement;
	let listId = `vendor-cb-${Math.random().toString(36).slice(2, 8)}`;

	$: selected = vendors.find((v) => String(v.nrsVendorId) === value) ?? null;
	$: matches = vendors.filter((v) => matchVendor(v, query)).slice(0, 60);
	$: if (highlight >= matches.length) highlight = Math.max(0, matches.length - 1);

	function choose(v: VendorOption): void {
		value = String(v.nrsVendorId);
		query = '';
		open = false;
		inputEl?.blur();
	}

	function onKey(e: KeyboardEvent): void {
		if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
			open = true;
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlight = Math.min(highlight + 1, matches.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlight = Math.max(highlight - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (matches[highlight]) choose(matches[highlight]);
		} else if (e.key === 'Escape') {
			open = false;
			query = '';
		}
	}
</script>

<div class="relative">
	<input
		bind:this={inputEl}
		class="input !w-56 !py-1.5"
		role="combobox"
		aria-label={ariaLabel}
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		placeholder={selected ? selected.displayName : placeholder}
		title={selected ? `${selected.displayName} (${selected.nrsVendorId})` : ''}
		bind:value={query}
		on:focus={() => { open = true; highlight = 0; }}
		on:input={() => { open = true; highlight = 0; }}
		on:blur={() => setTimeout(() => (open = false), 120)}
		on:keydown={onKey}
	/>
	{#if open}
		<ul id={listId} role="listbox" class="absolute z-30 mt-1 w-80 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
			{#if matches.length === 0}
				<li class="px-3 py-2 text-gray-500">No vendors match "{query}"</li>
			{/if}
			{#each matches as v, i (v.nrsVendorId)}
				<li
					role="option"
					aria-selected={String(v.nrsVendorId) === value}
					class="px-3 py-1.5 cursor-pointer flex items-baseline justify-between gap-3 {i === highlight ? 'bg-primary-50' : ''} {String(v.nrsVendorId) === value ? 'font-semibold' : ''}"
					on:mousedown|preventDefault={() => choose(v)}
					on:mouseenter={() => (highlight = i)}
				>
					<span class="truncate">{v.displayName} <span class="text-gray-400">({v.nrsVendorId})</span></span>
					<span class="text-xs text-gray-500 whitespace-nowrap">{vendorHint(v)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
