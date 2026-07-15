<script lang="ts">
	// Edit/Build paint controls: tool picker + active key/value pickers.
	// Edit mode exposes operational keys only; Build mode adds geometry keys.
	import type { AttrDef, Mode, Tool } from '$lib/floorplan/types';
	import { GEOMETRY_KEYS } from './geometry-keys';

	export let mode: Mode;
	export let tool: Tool = 'cell';
	export let defs: AttrDef[] = [];
	export let vendors: { nrsVendorId: number; displayName: string }[] = [];
	export let activeKey = 'vendor_id';
	/** null = erase (delete the key at painted cells) */
	export let activeValue: string | null = null;

	const TOOLS: { id: Tool; label: string; title: string }[] = [
		{ id: 'cell', label: '✏️', title: 'Cell brush' },
		{ id: 'rect', label: '▭', title: 'Rectangle' },
		{ id: 'fill', label: '🪣', title: 'Flood fill (contiguous same-value)' },
		{ id: 'wall', label: '📏', title: 'Wall / line' }
	];

	$: editableDefs = defs.filter((d) => (mode === 'build' ? true : !GEOMETRY_KEYS.has(d.key)));
	$: activeDef = defs.find((d) => d.key === activeKey);
	$: paletteValues =
		activeDef?.renderHint?.palette && activeDef.renderHint.palette !== 'auto'
			? Object.keys(activeDef.renderHint.palette)
			: null;
	$: erase = activeValue === null;

	// Keep activeKey legal when the mode changes.
	$: if (!editableDefs.some((d) => d.key === activeKey) && editableDefs.length > 0) {
		activeKey = editableDefs.some((d) => d.key === 'vendor_id') ? 'vendor_id' : editableDefs[0].key;
		activeValue = null;
	}

	function setErase(on: boolean): void {
		activeValue = on ? null : '';
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<div class="flex rounded-lg border border-gray-300 overflow-hidden">
		{#each TOOLS as t}
			<button
				type="button"
				class="px-2.5 py-1.5 text-sm {tool === t.id ? 'bg-primary-600 text-white' : 'bg-white hover:bg-gray-100'}"
				title={t.title}
				on:click={() => (tool = t.id)}>{t.label}</button
			>
		{/each}
	</div>

	<select class="input !w-auto !py-1.5" bind:value={activeKey} aria-label="Attribute to paint">
		{#each editableDefs as def}
			<option value={def.key}>{def.key}</option>
		{/each}
	</select>

	{#if erase}
		<span class="badge-danger">erasing {activeKey}</span>
	{:else if activeKey === 'vendor_id'}
		<select class="input !w-auto !py-1.5" bind:value={activeValue} aria-label="Vendor">
			<option value="" disabled>pick vendor…</option>
			{#each vendors as v}
				<option value={String(v.nrsVendorId)}>{v.displayName} ({v.nrsVendorId})</option>
			{/each}
		</select>
	{:else if paletteValues}
		<select class="input !w-auto !py-1.5" bind:value={activeValue} aria-label="Value">
			<option value="" disabled>pick value…</option>
			{#each paletteValues as value}
				<option {value}>{value}</option>
			{/each}
		</select>
	{:else}
		<input class="input !w-36 !py-1.5" placeholder="value" bind:value={activeValue} aria-label="Value" />
	{/if}

	<label class="flex items-center gap-1.5 text-sm text-gray-600">
		<input type="checkbox" checked={erase} on:change={(e) => setErase(e.currentTarget.checked)} />
		erase
	</label>
</div>
