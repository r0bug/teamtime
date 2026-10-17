<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { autoColor } from '$lib/floorplan/colors';
	import type { PageData } from './$types';

	export let data: PageData;

	// ── Controls (also in the URL so a worksheet setup can be bookmarked) ──
	type Shade = 'vendor' | 'zone' | 'kind' | 'none';
	type Paper = 'letter' | 'legal' | 'tabloid';
	let shade: Shade = (($page.url.searchParams.get('shade') as Shade) || 'vendor');
	let paper: Paper = (($page.url.searchParams.get('paper') as Paper) || 'letter');
	let landscape = $page.url.searchParams.get('portrait') !== '1';
	let zone = $page.url.searchParams.get('zone') ?? '';
	let rangeText = $page.url.searchParams.get('range') ?? ''; // "x1,y1-x2,y2"
	let fit = $page.url.searchParams.get('fit') !== '0'; // one page vs tiled
	let cellsPerInch = Number($page.url.searchParams.get('cpi') ?? 4) || 4;
	let showLabels = $page.url.searchParams.get('labels') !== '0';
	let showCoords = $page.url.searchParams.get('coords') !== '0';
	let showNotes = $page.url.searchParams.get('notes') !== '0';

	const PAPER: Record<Paper, [number, number]> = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17] };
	const MARGIN_IN = 0.4;
	const HEADER_IN = 0.55; // title line + legend
	const NOTES_IN = 1.1; // blank lines at the bottom of each sheet

	// ── Data ───────────────────────────────────────────────────────────────
	type Cell = { x: number; y: number; attrs: Record<string, string> };
	$: cellMap = new Map<string, Cell>(data.cells.map((c) => [`${c.x},${c.y}`, c]));
	$: kindDef = data.attrDefs.find((d) => d.key === 'kind');
	$: zoneDef = data.attrDefs.find((d) => d.key === 'zone');
	$: poolColor = new Map(data.pools.map((p) => [p.name, p.color]));

	/** Section to print: zone bounding box, explicit range, or everything painted. */
	$: section = (() => {
		let cells = data.cells;
		if (zone) cells = cells.filter((c) => c.attrs.zone === zone);
		const m = rangeText.match(/^\s*(\d+)\s*,\s*(\d+)\s*-\s*(\d+)\s*,\s*(\d+)\s*$/);
		if (m) {
			const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map(Number);
			return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
		}
		if (cells.length === 0) return { minX: 0, minY: 0, maxX: Math.max(0, (data.plan?.gridW ?? 1) - 1), maxY: Math.max(0, (data.plan?.gridH ?? 1) - 1) };
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const c of cells) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); }
		return { minX: Math.max(0, minX - 1), minY: Math.max(0, minY - 1), maxX: maxX + 1, maxY: maxY + 1 };
	})();
	$: secW = section.maxX - section.minX + 1;
	$: secH = section.maxY - section.minY + 1;

	// ── Paper geometry (inches) ────────────────────────────────────────────
	$: [pw, ph] = landscape ? [PAPER[paper][1], PAPER[paper][0]] : PAPER[paper];
	$: drawW = pw - 2 * MARGIN_IN - (showCoords ? 0.3 : 0);
	$: drawH = ph - 2 * MARGIN_IN - HEADER_IN - (showNotes ? NOTES_IN : 0) - (showCoords ? 0.3 : 0);
	/** Cell size in inches: fit the whole section on one sheet, or a fixed scale tiled over sheets. */
	$: cellIn = fit ? Math.min(drawW / secW, drawH / secH) : 1 / cellsPerInch;
	$: cellsAcross = fit ? secW : Math.max(1, Math.floor(drawW / cellIn));
	$: cellsDown = fit ? secH : Math.max(1, Math.floor(drawH / cellIn));
	$: sheets = (() => {
		const out: { minX: number; minY: number; maxX: number; maxY: number; col: number; row: number }[] = [];
		const cols = Math.ceil(secW / cellsAcross), rows = Math.ceil(secH / cellsDown);
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) {
				const minX = section.minX + c * cellsAcross, minY = section.minY + r * cellsDown;
				out.push({ minX, minY, maxX: Math.min(section.maxX, minX + cellsAcross - 1), maxY: Math.min(section.maxY, minY + cellsDown - 1), col: c + 1, row: r + 1 });
			}
		return out;
	})();

	// ── Shading ────────────────────────────────────────────────────────────
	/** Print-friendly fill: lighten the editor's dark palette so black labels read. */
	function lighten(color: string): string {
		const m = color.match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/);
		if (m) return `hsl(${m[1]}, 55%, 82%)`;
		const hex = color.match(/^#([0-9a-f]{6})$/i);
		if (hex) {
			const n = parseInt(hex[1], 16);
			const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
			const mix = (c: number) => Math.round(c + (255 - c) * 0.6);
			return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
		}
		return color;
	}
	const KIND_PRINT: Record<string, string> = { sellable: '#ffffff', structure: '#4b5563', boh: '#e5e7eb', circ: '#f8fafc' };
	function fillFor(c: Cell): string {
		const a = c.attrs;
		if (a.kind === 'structure') return KIND_PRINT.structure;
		if (shade === 'vendor') {
			if (a.vendor_id) return lighten(autoColor(a.vendor_id));
			if (a.pool) return lighten(poolColor.get(a.pool) ?? autoColor(a.pool));
		} else if (shade === 'zone' && a.zone) {
			return lighten(zoneBase(a.zone));
		} else if (shade === 'kind' && a.kind) {
			return KIND_PRINT[a.kind] ?? '#eeeeee';
		}
		return a.kind ? (KIND_PRINT[a.kind] ?? '#ffffff') : '#ffffff';
	}
	/** Outline key: a booth is the run of cells sharing a vendor (or pool); zones outline too. */
	function outlineKey(c: Cell | undefined): string | null {
		if (!c) return null;
		return c.attrs.vendor_id ? `v:${c.attrs.vendor_id}` : c.attrs.pool ? `p:${c.attrs.pool}` : null;
	}

	/** Edges between different booths (thick), and zone boundaries (dashed). */
	function edges(s: { minX: number; minY: number; maxX: number; maxY: number }) {
		const booth: string[] = [], zoneEdges: string[] = [];
		const at = (x: number, y: number) => cellMap.get(`${x},${y}`);
		for (let y = s.minY; y <= s.maxY; y++)
			for (let x = s.minX; x <= s.maxX; x++) {
				const c = at(x, y);
				const k = outlineKey(c);
				const z = c?.attrs.zone ?? null;
				// right edge
				const r = at(x + 1, y);
				if (k !== outlineKey(r) && (k || outlineKey(r))) booth.push(`M${x + 1 - s.minX},${y - s.minY}v1`);
				if (z !== (r?.attrs.zone ?? null) && (z || r?.attrs.zone)) zoneEdges.push(`M${x + 1 - s.minX},${y - s.minY}v1`);
				// bottom edge
				const b = at(x, y + 1);
				if (k !== outlineKey(b) && (k || outlineKey(b))) booth.push(`M${x - s.minX},${y + 1 - s.minY}h1`);
				if (z !== (b?.attrs.zone ?? null) && (z || b?.attrs.zone)) zoneEdges.push(`M${x - s.minX},${y + 1 - s.minY}h1`);
				// left/top edges on the sheet border
				if (x === s.minX && k) booth.push(`M0,${y - s.minY}v1`);
				if (y === s.minY && k) booth.push(`M${x - s.minX},0h1`);
			}
		return { booth: booth.join(''), zone: zoneEdges.join('') };
	}

	/** One label per booth (and per pool) inside the sheet: code at the centroid of its cells. */
	function labels(s: { minX: number; minY: number; maxX: number; maxY: number }) {
		const acc = new Map<string, { sx: number; sy: number; n: number; text: string; sub: string }>();
		for (const c of data.cells) {
			if (c.x < s.minX || c.x > s.maxX || c.y < s.minY || c.y > s.maxY) continue;
			const k = outlineKey(c);
			if (!k) continue;
			const v = c.attrs.vendor_id ? vendorsById[c.attrs.vendor_id] : undefined;
			const text = c.attrs.vendor_id ? (v?.code ?? `#${c.attrs.vendor_id}`) : c.attrs.pool!;
			const sub = c.attrs.vendor_id ? (v?.name ?? '') : 'pool';
			const e = acc.get(k) ?? { sx: 0, sy: 0, n: 0, text, sub };
			e.sx += c.x - s.minX + 0.5; e.sy += c.y - s.minY + 0.5; e.n++;
			acc.set(k, e);
		}
		return [...acc.values()].map((e) => ({ x: e.sx / e.n, y: e.sy / e.n, n: e.n, text: e.text, sub: e.sub }));
	}

	function legend() {
		if (shade === 'vendor') {
			const seen = new Map<string, string>();
			for (const c of data.cells) if (c.attrs.vendor_id && !seen.has(c.attrs.vendor_id)) seen.set(c.attrs.vendor_id, vendorsById[c.attrs.vendor_id]?.code ?? `#${c.attrs.vendor_id}`);
			return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, code]) => ({ color: lighten(autoColor(id)), text: code }));
		}
		if (shade === 'zone') return data.zones.map((z) => ({ color: lighten(zoneBase(z)), text: z }));
		if (shade === 'kind') return Object.entries(KIND_PRINT).map(([k, color]) => ({ color, text: k }));
		return [];
	}

	function apply() {
		const p = new URLSearchParams();
		if (data.plan) p.set('plan', data.plan.id);
		p.set('shade', shade); p.set('paper', paper);
		if (!landscape) p.set('portrait', '1');
		if (zone) p.set('zone', zone);
		if (rangeText.trim()) p.set('range', rangeText.trim());
		if (!fit) { p.set('fit', '0'); p.set('cpi', String(cellsPerInch)); }
		if (!showLabels) p.set('labels', '0');
		if (!showCoords) p.set('coords', '0');
		if (!showNotes) p.set('notes', '0');
		goto(`/floorplan/print?${p.toString()}`, { keepFocus: true, noScroll: true });
	}
	const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric' });
	const PX = 96; // CSS px per inch

	// @page can't take CSS variables, so the sheet size/orientation is written
	// into a runtime style element whenever the controls change.
	let pageStyle: HTMLStyleElement | null = null;
	onMount(() => {
		pageStyle = document.createElement('style');
		document.head.appendChild(pageStyle);
		return () => pageStyle?.remove();
	});
	$: if (pageStyle) pageStyle.textContent = `@page { size: ${paper} ${landscape ? 'landscape' : 'portrait'}; margin: ${MARGIN_IN}in; }`;

	/** Zone palette from the attr def's render hint (jsonb → loosely typed). */
	$: zonePalette = ((zoneDef?.renderHint as { palette?: Record<string, string> | 'auto' } | null | undefined)?.palette ?? null) as Record<string, string> | 'auto' | null;
	function zoneBase(z: string): string {
		return zonePalette && typeof zonePalette === 'object' && zonePalette[z] ? zonePalette[z] : autoColor(z);
	}
	$: vendorsById = data.vendorsById as Record<string, { code: string | null; name: string }>;
</script>

<svelte:head>
	<title>Floorplan worksheet - TeamTime</title>
</svelte:head>

<div class="no-print p-4 lg:p-8 max-w-5xl mx-auto">
	<div class="flex items-center gap-2 text-sm text-gray-500 mb-2">
		<a href="/floorplan{data.plan ? `?plan=${data.plan.id}` : ''}" class="hover:text-primary-600">Floorplan</a><span>›</span><span class="text-gray-900">Print worksheet</span>
	</div>
	<h1 class="text-2xl font-bold text-gray-900">Floorplan worksheet</h1>
	<p class="text-gray-600 mb-4">Grid, booth outlines and shading for marking changes on paper. Print the whole plan on one sheet, or a zone / coordinate range tiled at a readable scale.</p>
	{#if !data.plan}
		<p class="text-gray-500">No floorplan yet.</p>
	{:else}
		<div class="card"><div class="card-body grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
			<div><label class="label" for="shade">Shading</label><select id="shade" class="input" bind:value={shade}><option value="vendor">Vendors (booth colors)</option><option value="zone">Zones</option><option value="kind">Structure / sellable / back of house</option><option value="none">Outlines only</option></select></div>
			<div><label class="label" for="zone">Section</label><select id="zone" class="input" bind:value={zone}><option value="">Whole plan</option>{#each data.zones as z}<option value={z}>zone: {z}</option>{/each}</select></div>
			<div><label class="label" for="range">…or coordinate range</label><input id="range" class="input font-mono" placeholder="x1,y1-x2,y2  e.g. 60,0-110,40" bind:value={rangeText} /></div>
			<div><label class="label" for="paper">Paper</label><div class="flex gap-2"><select id="paper" class="input" bind:value={paper}><option value="letter">Letter</option><option value="legal">Legal</option><option value="tabloid">Tabloid 11×17</option></select><label class="flex items-center gap-1 whitespace-nowrap"><input type="checkbox" bind:checked={landscape} /> landscape</label></div></div>
			<div class="col-span-2"><label class="label">Scale</label>
				<div class="flex flex-wrap items-center gap-3">
					<label class="flex items-center gap-1"><input type="radio" bind:group={fit} value={true} /> fit on one sheet ({(cellIn * 12).toFixed(1)} in per 10 ft)</label>
					<label class="flex items-center gap-1"><input type="radio" bind:group={fit} value={false} /> tile at <input type="number" min="1" max="12" class="input w-16 py-0.5" bind:value={cellsPerInch} /> cells per inch ({sheets.length} sheet{sheets.length === 1 ? '' : 's'})</label>
				</div>
			</div>
			<div class="col-span-2 flex flex-wrap items-center gap-4">
				<label class="flex items-center gap-1"><input type="checkbox" bind:checked={showLabels} /> vendor codes</label>
				<label class="flex items-center gap-1"><input type="checkbox" bind:checked={showCoords} /> coordinates</label>
				<label class="flex items-center gap-1"><input type="checkbox" bind:checked={showNotes} /> notes lines</label>
				<button type="button" class="btn-secondary btn-sm" on:click={apply}>Update link</button>
				<button type="button" class="btn-primary" on:click={() => window.print()}>Print…</button>
			</div>
		</div></div>
		<p class="text-xs text-gray-500 mt-2">Section {section.minX},{section.minY} – {section.maxX},{section.maxY} ({secW} × {secH} cells, 1 cell = 1 ft). Use your browser's print dialog for the color printer; background graphics must be on.</p>
	{/if}
</div>

{#if data.plan}
	{#each sheets as s, i (i)}
		{@const w = s.maxX - s.minX + 1}
		{@const h = s.maxY - s.minY + 1}
		{@const e = edges(s)}
		{@const lab = showLabels ? labels(s) : []}
		{@const coordPad = showCoords ? 0.3 : 0}
		<section class="sheet" style="width: {pw}in; min-height: {ph}in;">
			<div class="sheet-head">
				<div><strong>{data.plan.name}</strong> — floorplan worksheet{zone ? `, zone ${zone}` : ''}{sheets.length > 1 ? ` — sheet ${i + 1} of ${sheets.length} (col ${s.col}, row ${s.row})` : ''}</div>
				<div class="meta">cells {s.minX},{s.minY} – {s.maxX},{s.maxY} · 1 cell = 1 ft · printed {today}{data.printedBy ? ` by ${data.printedBy}` : ''}</div>
				{#if legend().length}
					<div class="legend">{#each legend() as l}<span><i style="background:{l.color}"></i>{l.text}</span>{/each}</div>
				{/if}
			</div>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="{(w * cellIn + coordPad) * PX}"
				height="{(h * cellIn + coordPad) * PX}"
				viewBox="{-coordPad / cellIn} {-coordPad / cellIn} {w + coordPad / cellIn} {h + coordPad / cellIn}"
				font-family="Arial, Helvetica, sans-serif"
			>
				<!-- cells -->
				{#each Array.from({ length: h }) as _, ry}
					{#each Array.from({ length: w }) as _, rx}
						{@const c = cellMap.get(`${s.minX + rx},${s.minY + ry}`)}
						{#if c}
							<rect x={rx} y={ry} width="1" height="1" fill={fillFor(c)} />
							{#if c.attrs.door === 'true'}<rect x={rx + 0.25} y={ry + 0.25} width="0.5" height="0.5" fill="#9ca3af" />{/if}
							{#if c.attrs.level && shade !== 'none'}<line x1={rx} y1={ry + 1} x2={rx + 1} y2={ry} stroke="#9ca3af" stroke-width="0.04" />{/if}
						{/if}
					{/each}
				{/each}
				<!-- fine grid -->
				<path d={Array.from({ length: w + 1 }, (_, k) => `M${k},0v${h}`).join('') + Array.from({ length: h + 1 }, (_, k) => `M0,${k}h${w}`).join('')} stroke="#c7cdd4" stroke-width="0.02" fill="none" />
				<!-- heavy grid every 10 cells (absolute coordinates) -->
				<path d={Array.from({ length: w + 1 }, (_, k) => ((s.minX + k) % 10 === 0 ? `M${k},0v${h}` : '')).join('') + Array.from({ length: h + 1 }, (_, k) => ((s.minY + k) % 10 === 0 ? `M0,${k}h${w}` : '')).join('')} stroke="#6b7280" stroke-width="0.05" fill="none" />
				<!-- zone boundaries, booth outlines -->
				<path d={e.zone} stroke="#2563eb" stroke-width="0.08" stroke-dasharray="0.3 0.2" fill="none" />
				<path d={e.booth} stroke="#111827" stroke-width="0.12" fill="none" stroke-linecap="square" />
				<!-- coordinates -->
				{#if showCoords}
					{#each Array.from({ length: w + 1 }) as _, k}
						{#if (s.minX + k) % 5 === 0 && k <= w}<text x={k} y={-0.08 / cellIn * 0.3 - 0.05} font-size={Math.min(0.5, 0.22 / cellIn)} text-anchor="middle" fill="#374151">{s.minX + k}</text>{/if}
					{/each}
					{#each Array.from({ length: h + 1 }) as _, k}
						{#if (s.minY + k) % 5 === 0 && k <= h}<text x={-0.06} y={k + 0.12} font-size={Math.min(0.5, 0.22 / cellIn)} text-anchor="end" fill="#374151">{s.minY + k}</text>{/if}
					{/each}
				{/if}
				<!-- labels -->
				{#each lab as l}
					{@const fs = Math.max(0.35, Math.min(1.4, Math.sqrt(l.n) * 0.35))}
					<text x={l.x} y={l.y + fs * 0.35} font-size={fs} font-weight="700" text-anchor="middle" fill="#111827" stroke="#ffffff" stroke-width={fs * 0.12} paint-order="stroke">{l.text}</text>
					{#if l.n >= 12}<text x={l.x} y={l.y + fs * 0.35 + fs * 0.75} font-size={fs * 0.45} text-anchor="middle" fill="#374151" stroke="#ffffff" stroke-width={fs * 0.08} paint-order="stroke">{l.n} sq ft{l.sub ? ` · ${l.sub}` : ''}</text>{/if}
				{/each}
			</svg>
			{#if showNotes}
				<div class="notes"><div>Changes noted by: ____________________  Date: __________</div><div class="lines"></div></div>
			{/if}
		</section>
	{/each}
{/if}

<style>
	.sheet { background: white; color: #111; margin: 0 auto 1rem; padding: 0.4in; box-shadow: 0 1px 4px rgba(0,0,0,0.15); box-sizing: border-box; page-break-after: always; break-after: page; }
	.sheet-head { font-size: 11pt; margin-bottom: 0.1in; }
	.sheet-head .meta { font-size: 8.5pt; color: #444; }
	.legend { display: flex; flex-wrap: wrap; gap: 0.08in 0.18in; font-size: 8pt; margin-top: 0.04in; }
	.legend span { display: inline-flex; align-items: center; gap: 0.05in; }
	.legend i { display: inline-block; width: 0.14in; height: 0.1in; border: 1px solid #555; }
	.notes { margin-top: 0.15in; font-size: 9pt; }
	.notes .lines { height: 0.8in; background: repeating-linear-gradient(to bottom, transparent 0, transparent 0.24in, #999 0.24in, #999 0.25in); margin-top: 0.08in; }
	@media print {
		.no-print { display: none !important; }
		.sheet { margin: 0; padding: 0; box-shadow: none; width: auto !important; min-height: 0 !important; }
		:global(body) { background: white !important; }
		:global(nav), :global(header), :global(aside) { display: none !important; }
		:global(main) { padding: 0 !important; margin: 0 !important; }
	}
	@media screen { :global(body) { background: #e5e7eb; } }
</style>
