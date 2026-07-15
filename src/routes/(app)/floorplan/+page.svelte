<script lang="ts">
	import { goto } from '$app/navigation';
	import { notify } from '$lib/notify';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FloorplanCanvas from '$lib/components/floorplan/FloorplanCanvas.svelte';
	import CellPopover from '$lib/components/floorplan/CellPopover.svelte';
	import PaintToolbar from '$lib/components/floorplan/PaintToolbar.svelte';
	import type { PageData } from './$types';
	import type { CellMap, Mode, Tool } from '$lib/floorplan/types';
	import { cellKey } from '$lib/floorplan/types';
	import { PaintSession, rectCells, lineCells, floodCells } from '$lib/floorplan/paint';
	import { checkReachability } from '$lib/floorplan/reachability';

	export let data: PageData;

	let mode: Mode = 'view';
	let tool: Tool = 'cell';
	let overlayKey = 'kind';
	let activeKey = 'vendor_id';
	let activeValue: string | null = ''; // '' = pick-a-value; null = erase mode
	let canvas: FloorplanCanvas;
	let saving = false;

	// Working copy of the plan; PaintSession mutates it optimistically.
	let cells: CellMap = new Map();
	$: cells = new Map(data.cells.map((c) => [cellKey(c.x, c.y), { ...c.attrs }]));

	let session: PaintSession | null = null;
	let anchor: { x: number; y: number } | null = null;
	let preview: Set<string> = new Set();
	let unreachable: Set<string> = new Set();
	let reachMsg = '';

	let hover: { x: number; y: number; clientX: number; clientY: number } | null = null;
	$: hoverAttrs = hover ? (cells.get(cellKey(hover.x, hover.y)) ?? {}) : {};

	$: modes = (['view', ...(data.canEdit ? ['edit'] : []), ...(data.canBuild ? ['build'] : [])] as Mode[]);

	// Paint must be visible: while editing, the overlay follows the key being
	// painted (painting vendor_id with the kind overlay looks like a no-op).
	$: if (mode !== 'view' && activeKey) overlayKey = activeKey;

	function switchPlan(e: Event): void {
		goto(`/floorplan?plan=${(e.target as HTMLSelectElement).value}`);
	}

	function paintValue(): string | null {
		return activeValue === '' ? null : activeValue;
	}

	function ready(): boolean {
		if (mode === 'view' || !data.plan) return false;
		if (paintValue() === null) return true; // erase
		return true;
	}

	function onPaintDown(e: CustomEvent<{ x: number; y: number }>): void {
		if (!ready() || !data.plan) return;
		session = new PaintSession(cells, data.plan.gridW, data.plan.gridH);
		anchor = { x: e.detail.x, y: e.detail.y };
		if (tool === 'cell') {
			session.apply(e.detail.x, e.detail.y, activeKey, paintValue());
			cells = cells;
		} else if (tool === 'rect' || tool === 'wall') {
			preview = new Set([cellKey(e.detail.x, e.detail.y)]);
		}
	}

	function onPaintMove(e: CustomEvent<{ x: number; y: number }>): void {
		if (!session || !anchor) return;
		if (tool === 'cell') {
			session.apply(e.detail.x, e.detail.y, activeKey, paintValue());
			cells = cells;
		} else if (tool === 'rect') {
			preview = new Set(rectCells(anchor.x, anchor.y, e.detail.x, e.detail.y).map((c) => cellKey(c.x, c.y)));
		} else if (tool === 'wall') {
			preview = new Set(lineCells(anchor.x, anchor.y, e.detail.x, e.detail.y).map((c) => cellKey(c.x, c.y)));
		}
	}

	async function onPaintUp(e: CustomEvent<{ x: number; y: number }>): Promise<void> {
		if (!session || !anchor || !data.plan) return;
		if (tool === 'rect') {
			for (const c of rectCells(anchor.x, anchor.y, e.detail.x, e.detail.y)) {
				session.apply(c.x, c.y, activeKey, paintValue());
			}
		} else if (tool === 'wall') {
			for (const c of lineCells(anchor.x, anchor.y, e.detail.x, e.detail.y)) {
				session.apply(c.x, c.y, activeKey, paintValue());
			}
		} else if (tool === 'fill') {
			for (const c of floodCells(cells, anchor.x, anchor.y, activeKey, data.plan.gridW, data.plan.gridH)) {
				session.apply(c.x, c.y, activeKey, paintValue());
			}
		}
		preview = new Set();
		anchor = null;
		cells = cells;
		await save();
	}

	async function save(): Promise<void> {
		if (!session || !data.plan) return;
		const ops = session.ops();
		if (ops.length === 0) {
			session = null;
			return;
		}
		saving = true;
		try {
			const res = await fetch(`/api/floorplan/${data.plan.id}/cells`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ops })
			});
			if (res.ok) {
				session.commit();
				notify.success(`Saved ${ops.length} cell change${ops.length === 1 ? '' : 's'}`);
				if (unreachable.size > 0) runReachability(false);
			} else {
				const body = await res.json().catch(() => ({}));
				session.rollback();
				cells = cells;
				const detail = Array.isArray(body.violations) ? `: ${body.violations[0]}` : '';
				notify.error(`${body.error ?? body.message ?? 'Save failed'}${detail}`);
			}
		} catch {
			session.rollback();
			cells = cells;
			notify.error('Save failed — network error');
		} finally {
			saving = false;
			session = null;
		}
	}

	function runReachability(announce = true): void {
		const result = checkReachability(cells);
		unreachable = result.unreachable;
		if (result.doors === 0) {
			reachMsg = 'No door cells — mark a door to check reachability.';
		} else if (unreachable.size > 0) {
			reachMsg = `${unreachable.size} sellable cell${unreachable.size === 1 ? '' : 's'} unreachable from any door.`;
		} else {
			reachMsg = '';
			if (announce) notify.success(`All ${result.sellable} sellable cells reachable from ${result.doors} door(s)`);
		}
	}
</script>

<svelte:head>
	<title>Floorplan - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-[1400px] mx-auto">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">Floorplan</h1>
			<p class="text-gray-600 mt-1 text-sm">
				Booths are cells — a vendor's booth size is the count of their cells, never a stored number.
			</p>
		</div>
		{#if data.plans.length > 1 && data.plan}
			<select class="input !w-auto" value={data.plan.id} on:change={switchPlan} aria-label="Plan">
				{#each data.plans as p}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		{/if}
	</div>

	{#if !data.plan}
		<EmptyState title="No floorplans" message="Seed or create a plan to get started." />
	{:else}
		<div class="card">
			<div class="card-header flex flex-wrap items-center gap-3">
				<div class="flex rounded-lg border border-gray-300 overflow-hidden" role="tablist" aria-label="Mode">
					{#each modes as m}
						<button
							type="button"
							role="tab"
							aria-selected={mode === m}
							class="px-3 py-1.5 text-sm capitalize {mode === m ? 'bg-primary-600 text-white' : 'bg-white hover:bg-gray-100'}"
							on:click={() => (mode = m)}>{m}</button
						>
					{/each}
				</div>

				<label class="flex items-center gap-1.5 text-sm text-gray-600">
					overlay
					<select class="input !w-auto !py-1.5" bind:value={overlayKey}>
						{#each data.attrDefs as def}
							<option value={def.key}>{def.key}</option>
						{/each}
					</select>
				</label>

				<button type="button" class="btn-ghost btn-sm" on:click={() => canvas.fit()}>Fit</button>

				{#if mode === 'build'}
					<button type="button" class="btn-secondary btn-sm" on:click={() => runReachability()}>
						Check reachability
					</button>
				{/if}
				{#if saving}
					<span class="badge-gray">saving…</span>
				{/if}

				{#if mode !== 'view'}
					<div class="w-full">
						<PaintToolbar {mode} bind:tool bind:activeKey bind:activeValue defs={data.attrDefs} vendors={data.vendorOptions} />
					</div>
				{/if}
			</div>

			{#if reachMsg}
				<div class="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
					⚠ {reachMsg}
				</div>
			{/if}

			<div class="card-body !p-2" style="height: 70vh">
				<FloorplanCanvas
					bind:this={canvas}
					{cells}
					gridW={data.plan.gridW}
					gridH={data.plan.gridH}
					{overlayKey}
					defs={data.attrDefs}
					{mode}
					{preview}
					highlight={unreachable}
					on:hover={(e) => (hover = e.detail)}
					on:hoverend={() => (hover = null)}
					on:paintdown={onPaintDown}
					on:paintmove={onPaintMove}
					on:paintup={onPaintUp}
				/>
			</div>
		</div>

		{#if hover && mode === 'view' && Object.keys(hoverAttrs).length > 0}
			<CellPopover
				planId={data.plan.id}
				x={hover.x}
				y={hover.y}
				attrs={hoverAttrs}
				clientX={hover.clientX}
				clientY={hover.clientY}
			/>
		{/if}
	{/if}
</div>
