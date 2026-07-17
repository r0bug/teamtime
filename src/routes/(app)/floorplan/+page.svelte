<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
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

	// ---- vendor picker curation + custom colors (stored on the vendor_id
	// attr def's renderHint: { picker: { include: [...] }, palette: {...} })
	$: vendorDef = data.attrDefs.find((d) => d.key === 'vendor_id');
	$: pickerInclude = (vendorDef?.renderHint as { picker?: { include?: string[] } } | null)?.picker?.include;
	$: pickerVendors =
		pickerInclude && pickerInclude.length > 0
			? data.vendorOptions.filter((v) => pickerInclude.includes(String(v.nrsVendorId)))
			: data.vendorOptions;
	$: vendorPalette = (() => {
		const palette = (vendorDef?.renderHint as { palette?: Record<string, string> | 'auto' } | null)?.palette;
		return palette && palette !== 'auto' ? palette : {};
	})();

	let showPicker = false;
	let pickerSelected: Set<string> = new Set();
	let showPools = false;
	let poolForm = { id: '', name: '', color: '#7C3AED', members: [] as string[] };
	let savingConfig = false;

	function openPicker(): void {
		pickerSelected = new Set(pickerInclude?.length ? pickerInclude : data.vendorOptions.map((v) => String(v.nrsVendorId)));
		showPicker = true;
	}

	async function saveVendorDef(renderHint: Record<string, unknown>): Promise<boolean> {
		if (!data.plan || !vendorDef) return false;
		savingConfig = true;
		try {
			const res = await fetch(`/api/floorplan/${data.plan.id}/attrs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					key: 'vendor_id',
					type: vendorDef.type,
					ownerSystem: vendorDef.ownerSystem,
					visibility: vendorDef.visibility,
					renderHint
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				notify.error(body.error ?? 'Save failed');
				return false;
			}
			await invalidateAll();
			return true;
		} finally {
			savingConfig = false;
		}
	}

	async function savePicker(): Promise<void> {
		const all = data.vendorOptions.map((v) => String(v.nrsVendorId));
		const include = all.filter((id) => pickerSelected.has(id));
		const rh = { ...((vendorDef?.renderHint as Record<string, unknown>) ?? {}) };
		if (include.length === all.length) delete rh.picker;
		else rh.picker = { include };
		if (await saveVendorDef(rh)) {
			showPicker = false;
			notify.success(include.length === all.length ? 'Picker shows all vendors' : `Picker limited to ${include.length} vendors`);
		}
	}

	async function saveVendorColor(e: Event): Promise<void> {
		const color = (e.target as HTMLInputElement).value;
		if (!activeValue) return;
		const rh = { ...((vendorDef?.renderHint as Record<string, unknown>) ?? {}) };
		rh.mode = 'fill';
		rh.palette = { ...vendorPalette, [activeValue]: color };
		if (await saveVendorDef(rh)) notify.success('Vendor color saved');
	}

	function editPool(pool?: { id: string; name: string; color: string; vendorIds: string[] }): void {
		poolForm = pool
			? { id: pool.id, name: pool.name, color: pool.color, members: [...pool.vendorIds] }
			: { id: '', name: '', color: '#7C3AED', members: [] };
	}

	async function savePool(): Promise<void> {
		if (!data.plan) return;
		savingConfig = true;
		try {
			const res = await fetch(`/api/floorplan/${data.plan.id}/pools`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: poolForm.id || undefined,
					name: poolForm.name,
					color: poolForm.color,
					vendorIds: poolForm.members
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				notify.error(body.error ?? 'Pool save failed');
				return;
			}
			await invalidateAll();
			editPool();
			notify.success('Pool saved');
		} finally {
			savingConfig = false;
		}
	}

	async function deletePool(id: string): Promise<void> {
		if (!data.plan) return;
		const res = await fetch(`/api/floorplan/${data.plan.id}/pools?id=${id}`, { method: 'DELETE' });
		if (res.ok) {
			await invalidateAll();
			notify.success('Pool deleted (painted cells kept — erase them if needed)');
		} else {
			notify.error('Delete failed');
		}
	}

	function switchPlan(e: Event): void {
		goto(`/floorplan?plan=${(e.target as HTMLSelectElement).value}`);
	}

	function paintValue(): string | null {
		return activeValue === '' ? null : activeValue;
	}

	let skipped = 0; // cells dropped from the current stroke (not sellable)

	// Stage one op, skipping cells the server would reject: vendor
	// assignments only land on sellable cells, so a rect/fill that clips a
	// structure paints around it instead of failing the whole batch. Skips
	// are counted and reported — a silently-dropped stroke reads as "paint
	// is broken".
	function stage(x: number, y: number): void {
		if (!session) return;
		const value = paintValue();
		if ((activeKey === 'vendor_id' || activeKey === 'pool') && value !== null && cells.get(cellKey(x, y))?.kind !== 'sellable') {
			skipped++;
			return;
		}
		session.apply(x, y, activeKey, value);
	}

	function ready(): boolean {
		if (mode === 'view' || !data.plan) return false;
		if (paintValue() === null) return true; // erase
		return true;
	}

	function onPaintDown(e: CustomEvent<{ x: number; y: number }>): void {
		if (!ready() || !data.plan) return;
		session = new PaintSession(cells, data.plan.gridW, data.plan.gridH);
		skipped = 0;
		anchor = { x: e.detail.x, y: e.detail.y };
		if (tool === 'cell') {
			stage(e.detail.x, e.detail.y);
			cells = cells;
		} else if (tool === 'rect' || tool === 'wall') {
			preview = new Set([cellKey(e.detail.x, e.detail.y)]);
		}
	}

	function onPaintMove(e: CustomEvent<{ x: number; y: number }>): void {
		if (!session || !anchor) return;
		if (tool === 'cell') {
			stage(e.detail.x, e.detail.y);
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
				stage(c.x, c.y);
			}
		} else if (tool === 'wall') {
			for (const c of lineCells(anchor.x, anchor.y, e.detail.x, e.detail.y)) {
				stage(c.x, c.y);
			}
		} else if (tool === 'fill') {
			for (const c of floodCells(cells, anchor.x, anchor.y, activeKey, data.plan.gridW, data.plan.gridH)) {
				stage(c.x, c.y);
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
			if (skipped > 0) {
				notify.error(`Nothing painted — all ${skipped} cells in that stroke are structure or void, not sellable floor`);
			}
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
				const skipNote = skipped > 0 ? ` (skipped ${skipped} non-sellable)` : '';
				notify.success(`Saved ${ops.length} cell change${ops.length === 1 ? '' : 's'}${skipNote}`);
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

				<div class="flex items-center gap-1">
					<button type="button" class="btn-ghost btn-sm" title="Zoom out" on:click={() => canvas.zoomBy(1 / 1.4)}>−</button>
					<button type="button" class="btn-ghost btn-sm" title="Zoom in" on:click={() => canvas.zoomBy(1.4)}>+</button>
					<button type="button" class="btn-ghost btn-sm" on:click={() => canvas.fit()}>Fit</button>
				</div>
				<span class="text-xs text-gray-400 hidden lg:inline">
					scroll to move · ctrl+wheel or +/− to zoom{mode !== 'view' ? ' · hold Space to drag-pan' : ''}
				</span>

				{#if mode === 'build'}
					<button type="button" class="btn-secondary btn-sm" on:click={() => runReachability()}>
						Check reachability
					</button>
				{/if}
				{#if saving}
					<span class="badge-gray">saving…</span>
				{/if}

				{#if mode !== 'view'}
					<div class="w-full flex flex-wrap items-center gap-2">
						<PaintToolbar {mode} bind:tool bind:activeKey bind:activeValue defs={data.attrDefs} vendors={pickerVendors} pools={data.pools} />
						{#if data.canBuild && activeKey === 'vendor_id' && activeValue}
							<label class="flex items-center gap-1.5 text-sm text-gray-600" title="Color for this vendor on the map">
								color
								<input type="color" value={vendorPalette[activeValue] ?? '#888888'} on:change={saveVendorColor} disabled={savingConfig} />
							</label>
						{/if}
						{#if data.canBuild && activeKey === 'vendor_id'}
							<button type="button" class="btn-ghost btn-sm" on:click={openPicker}>Picker vendors…</button>
						{/if}
						<button type="button" class="btn-ghost btn-sm" on:click={() => { editPool(); showPools = true; }}>Pools…</button>
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

		<Modal bind:open={showPicker} title="Vendors shown in the picker" size="md" on:close={() => (showPicker = false)}>
			<p class="text-sm text-gray-600 mb-3">
				Untick vendors to hide them from the Edit-mode dropdown. This only affects the picker — existing paint is untouched.
			</p>
			<div class="max-h-80 overflow-y-auto space-y-1">
				{#each data.vendorOptions as v}
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={pickerSelected.has(String(v.nrsVendorId))}
							on:change={(e) => {
								const id = String(v.nrsVendorId);
								if (e.currentTarget.checked) pickerSelected.add(id);
								else pickerSelected.delete(id);
								pickerSelected = pickerSelected;
							}}
						/>
						{v.displayName} ({v.nrsVendorId})
					</label>
				{/each}
			</div>
			<div slot="footer" class="flex justify-end gap-2">
				<button type="button" class="btn-secondary btn-sm" on:click={() => (showPicker = false)}>Cancel</button>
				<button type="button" class="btn-primary btn-sm" disabled={savingConfig} on:click={savePicker}>Save</button>
			</div>
		</Modal>

		<Modal bind:open={showPools} title="Vendor pools (shared / in-store spaces)" size="lg" on:close={() => (showPools = false)}>
			<p class="text-sm text-gray-600 mb-3">
				A pool is a named group of vendors sharing space. Paint it by picking the <span class="font-mono">pool</span> attribute
				in the toolbar; the floor shows the pool's name and color, and booth counts stay per-pool.
			</p>

			{#if data.pools.length > 0}
				<div class="space-y-1 mb-4">
					{#each data.pools as pool}
						<div class="flex items-center gap-2 text-sm">
							<span class="inline-block w-4 h-4 rounded" style="background:{pool.color}"></span>
							<span class="font-medium">{pool.name}</span>
							<span class="text-gray-500">{pool.vendorIds.length} vendor{pool.vendorIds.length === 1 ? '' : 's'}</span>
							<button type="button" class="btn-ghost btn-sm" on:click={() => editPool(pool)}>edit</button>
							<button type="button" class="btn-ghost btn-sm !text-red-600" on:click={() => deletePool(pool.id)}>delete</button>
						</div>
					{/each}
				</div>
			{/if}

			<div class="border-t border-gray-200 pt-3 space-y-2">
				<div class="font-medium text-sm">{poolForm.id ? `Edit "${poolForm.name}"` : 'New pool'}</div>
				<div class="flex flex-wrap items-center gap-2">
					<input class="input !w-56" placeholder="Pool name (e.g. Shared Case 1)" bind:value={poolForm.name} />
					<label class="flex items-center gap-1.5 text-sm text-gray-600">
						color <input type="color" bind:value={poolForm.color} />
					</label>
				</div>
				<label class="label !mb-0" for="pool-members">Member vendors (ctrl-click for several)</label>
				<select id="pool-members" class="input" multiple size="8" bind:value={poolForm.members}>
					{#each data.vendorOptions as v}
						<option value={String(v.nrsVendorId)}>{v.displayName} ({v.nrsVendorId})</option>
					{/each}
				</select>
			</div>
			<div slot="footer" class="flex justify-between">
				<button type="button" class="btn-secondary btn-sm" on:click={() => editPool()}>Clear form</button>
				<div class="flex gap-2">
					<button type="button" class="btn-secondary btn-sm" on:click={() => (showPools = false)}>Close</button>
					<button type="button" class="btn-primary btn-sm" disabled={savingConfig || !poolForm.name} on:click={savePool}>
						{poolForm.id ? 'Save changes' : 'Create pool'}
					</button>
				</div>
			</div>
		</Modal>
	{/if}
</div>
