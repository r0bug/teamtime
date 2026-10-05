<script lang="ts">
	// Read-only floor view centered on ONE vendor. Used by the admin vendor
	// record and the vendor portal; the server decides what attrs the viewer
	// gets, this just draws them. No paint, no config — ever.
	import { goto } from '$app/navigation';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FloorplanCanvas from '$lib/components/floorplan/FloorplanCanvas.svelte';
	import CellPopover from '$lib/components/floorplan/CellPopover.svelte';
	import type { AttrDef, CellMap } from '$lib/floorplan/types';
	import { cellKey, parseKey } from '$lib/floorplan/types';
	import { cellColor } from '$lib/floorplan/colors';

	export let plans: { id: string; name: string }[] = [];
	export let plan: { id: string; name: string; gridW: number; gridH: number } | null;
	export let cells: { x: number; y: number; attrs: Record<string, string> }[] = [];
	export let attrDefs: AttrDef[] = [];
	export let boothKeys: string[] = [];
	export let pools: { id: string; name: string; color: string; cellKeys: string[] }[] = [];
	/** vendor is linked to NRS (booths are painted by NRS vendor id) */
	export let linked = true;
	/** base path for ?plan= switching, e.g. "/vendor/floorplan" */
	export let planHrefBase: string;
	/** hover popover hits a staff-only API — portal viewers get none */
	export let showPopover = false;
	/** "no cells painted" copy differs for staff vs the vendor themself */
	export let emptyBoothMessage = 'No cells are painted for this vendor on this plan.';
	export let unlinkedMessage =
		"Booths are painted by NRS vendor ID. Set this vendor's NRS ID on their profile, then paint their cells on the floorplan.";

	// The booth pops in amber with a white outline; member pools use the
	// pool color; everything else is the muted 'kind' building outline.
	const BOOTH_COLOR = '#F59E0B';
	const BOOTH_OUTLINE = '#FFFFFF';

	let canvas: FloorplanCanvas;
	let hover: { x: number; y: number; clientX: number; clientY: number } | null = null;

	$: cellMap = new Map(cells.map((c) => [cellKey(c.x, c.y), { ...c.attrs }])) as CellMap;
	$: boothSet = new Set(boothKeys);
	$: poolColorByKey = new Map(pools.flatMap((p) => p.cellKeys.map((k) => [k, p.color] as [string, string])));
	$: focusKeys = new Set([...boothKeys, ...poolColorByKey.keys()]);
	$: hoverAttrs = hover ? (cellMap.get(cellKey(hover.x, hover.y)) ?? {}) : {};
	$: kindDef = attrDefs.find((d) => d.key === 'kind');

	$: renderLayer = (() => {
		const layer = new Map<string, string>();
		// Booth/pool cells may be absent from `cells` when the viewer can't
		// see any of their attrs — paint them from the key lists regardless.
		for (const k of boothKeys) layer.set(k, BOOTH_COLOR);
		for (const [k, color] of poolColorByKey) if (!layer.has(k)) layer.set(k, color);
		for (const [key, attrs] of cellMap) {
			if (layer.has(key)) continue;
			const base = cellColor(attrs, 'kind', kindDef);
			if (base) layer.set(key, base);
		}
		return layer;
	})();

	// FloorplanCanvas only draws keys present in `cells`; make sure the
	// highlighted cells exist there even for a minimal attr payload.
	$: drawCells = (() => {
		const m: CellMap = new Map(cellMap);
		for (const k of focusKeys) if (!m.has(k)) m.set(k, {});
		return m;
	})();

	$: boothBounds = (() => {
		if (boothKeys.length === 0) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const k of boothKeys) {
			const { x, y } = parseKey(k);
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
		return { w: maxX - minX + 1, h: maxY - minY + 1 };
	})();

	function switchPlan(e: Event): void {
		goto(`${planHrefBase}?plan=${(e.target as HTMLSelectElement).value}`);
	}

	function zoomToBooth(): void {
		if (focusKeys.size > 0) canvas.fitTo(focusKeys);
	}

	// Open framed on the booth once the canvas has measured itself.
	let framed = false;
	$: if (canvas && !framed && focusKeys.size > 0) {
		framed = true;
		requestAnimationFrame(zoomToBooth);
	}
</script>

{#if plans.length > 1 && plan}
	<div class="mb-4 flex justify-end">
		<select class="input !w-auto" value={plan.id} on:change={switchPlan} aria-label="Plan">
			{#each plans as p}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
	</div>
{/if}

{#if !plan}
	<EmptyState title="No floorplan yet" message="The floorplan hasn't been set up." />
{:else if !linked}
	<EmptyState title="Booth not set up" message={unlinkedMessage} />
{:else}
	<div class="grid gap-4 lg:grid-cols-[1fr_16rem]">
		<div class="card">
			<div class="card-header flex flex-wrap items-center gap-3">
				<span class="badge-gray">view only</span>
				<div class="flex items-center gap-1">
					<button type="button" class="btn-ghost btn-sm" title="Zoom out" on:click={() => canvas.zoomBy(1 / 1.4)}>−</button>
					<button type="button" class="btn-ghost btn-sm" title="Zoom in" on:click={() => canvas.zoomBy(1.4)}>+</button>
					<button type="button" class="btn-ghost btn-sm" on:click={() => canvas.fit()}>Whole floor</button>
					<button type="button" class="btn-secondary btn-sm" disabled={focusKeys.size === 0} on:click={zoomToBooth}>
						Zoom to booth
					</button>
				</div>
				<span class="text-xs text-gray-400 hidden lg:inline">drag or scroll to move · ctrl+wheel or +/− to zoom</span>
			</div>
			<div class="card-body !p-2" style="height: 70vh">
				<FloorplanCanvas
					bind:this={canvas}
					cells={drawCells}
					gridW={plan.gridW}
					gridH={plan.gridH}
					overlayKey="kind"
					defs={attrDefs}
					mode="view"
					{renderLayer}
					highlight={boothSet}
					highlightColor={BOOTH_OUTLINE}
					on:hover={(e) => (hover = e.detail)}
					on:hoverend={() => (hover = null)}
				/>
			</div>
		</div>

		<aside class="space-y-4">
			<div class="card">
				<div class="card-header font-semibold">Booth</div>
				<div class="card-body text-sm space-y-2">
					{#if boothKeys.length === 0}
						<p class="text-gray-600">{emptyBoothMessage}</p>
					{:else}
						<div class="flex items-center gap-2">
							<span class="inline-block h-3 w-3 rounded-sm" style="background:{BOOTH_COLOR}"></span>
							<span class="text-gray-600">Highlighted cells</span>
						</div>
						<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
							<dt class="text-gray-500">Size</dt>
							<dd class="font-medium">{boothKeys.length} sq ft</dd>
							{#if boothBounds}
								<dt class="text-gray-500">Footprint</dt>
								<dd class="font-medium">{boothBounds.w} × {boothBounds.h} ft</dd>
							{/if}
							<dt class="text-gray-500">Plan</dt>
							<dd class="font-medium">{plan.name}</dd>
						</dl>
					{/if}
				</div>
			</div>

			{#if pools.length > 0}
				<div class="card">
					<div class="card-header font-semibold">Shared spaces</div>
					<div class="card-body text-sm space-y-2">
						{#each pools as pool (pool.id)}
							<div class="flex items-center gap-2">
								<span class="inline-block h-3 w-3 rounded-sm" style="background:{pool.color}"></span>
								<span class="flex-1 min-w-0 truncate">{pool.name}</span>
								<span class="text-gray-500">{pool.cellKeys.length} sq ft</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</aside>
	</div>

	{#if showPopover && hover && Object.keys(hoverAttrs).length > 0}
		<CellPopover planId={plan.id} x={hover.x} y={hover.y} attrs={hoverAttrs} clientX={hover.clientX} clientY={hover.clientY} />
	{/if}
{/if}
