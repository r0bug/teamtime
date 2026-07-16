<script lang="ts">
	// Grid renderer + pointer input. Rendering only — tool semantics live in
	// the page; this component turns pointer gestures into cell-coord events.
	//
	// Camera model: the wrapper is a real scroll container whose scrollable
	// extent is the world at the current zoom (an invisible absolutely-
	// positioned spacer sets the size), and the canvas is position:sticky so
	// it always fills the viewport. Native scrollbars give access to every
	// edge; zoom rescales the spacer and re-anchors scroll so the world point
	// under the cursor stays put.
	//
	// Redraw strategy: full redraw per dirty-flagged rAF with viewport
	// culling over the sparse CellMap. At 7k-40k painted cells one fillRect
	// pass is comfortably under frame budget — do NOT add tiling/layer
	// caches without profiling a real problem first.
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { CellMap, AttrDef, Mode } from '$lib/floorplan/types';
	import { parseKey } from '$lib/floorplan/types';
	import { contentBBox, MIN_SCALE, MAX_SCALE } from '$lib/floorplan/camera';
	import { cellColor, VOID_BG } from '$lib/floorplan/colors';

	export let cells: CellMap;
	export let gridW: number;
	export let gridH: number;
	export let overlayKey = 'kind';
	export let defs: AttrDef[] = [];
	export let mode: Mode = 'view';
	/** transient injected color layer: "x,y" -> color (overrides overlay) */
	export let renderLayer: Map<string, string> | null = null;
	/** cells to outline as a warning (reachability check) */
	export let highlight: Set<string> = new Set();
	/** live tool preview: cells to tint while dragging */
	export let preview: Set<string> = new Set();

	const dispatch = createEventDispatcher<{
		hover: { x: number; y: number; clientX: number; clientY: number };
		hoverend: void;
		paintdown: { x: number; y: number };
		paintmove: { x: number; y: number };
		paintup: { x: number; y: number };
	}>();

	let canvas: HTMLCanvasElement;
	let wrap: HTMLDivElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let scale = 8; // px per foot (CSS px)
	let dirty = true;
	let raf = 0;
	let cssW = 0;
	let cssH = 0;

	let panning = false;
	let painting = false;
	let spaceHeld = false;
	let lastPointer: { x: number; y: number } | null = null;
	let lastHoverCell: string | null = null;

	$: defByKey = new Map(defs.map((d) => [d.key, d]));
	// Any input change repaints.
	$: cells, overlayKey, renderLayer, highlight, preview, gridW, gridH, invalidate();
	$: spacerW = gridW * scale;
	$: spacerH = gridH * scale;

	// World coord at the viewport's left/TOP edge (+y = north = up on screen,
	// so scrollTop 0 shows the grid's north edge).
	function offsetX(): number {
		return (wrap?.scrollLeft ?? 0) / scale;
	}
	function offsetY(): number {
		return gridH - (wrap?.scrollTop ?? 0) / scale;
	}

	function worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
		return { sx: (wx - offsetX()) * scale, sy: (offsetY() - wy) * scale };
	}

	function screenToCell(sx: number, sy: number): { x: number; y: number } {
		return { x: Math.floor(offsetX() + sx / scale), y: Math.floor(offsetY() - sy / scale) };
	}

	export function fit(): void {
		const bbox = contentBBox(cells);
		if (!bbox || cssW <= 0 || cssH <= 0) return;
		const margin = 24;
		const w = bbox.maxX - bbox.minX;
		const h = bbox.maxY - bbox.minY;
		scale = Math.min(
			MAX_SCALE,
			Math.max(MIN_SCALE, Math.min((cssW - 2 * margin) / w, (cssH - 2 * margin) / h))
		);
		queueScroll(bbox.minX * scale - margin, (gridH - bbox.maxY) * scale - margin);
	}

	/** Zoom keeping the world point at viewport position (px,py) fixed. */
	export function zoomAt(px: number, py: number, factor: number): void {
		const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
		if (next === scale) return;
		const wx = offsetX() + px / scale;
		const wy = offsetY() - py / scale;
		scale = next;
		queueScroll(wx * scale - px, (gridH - wy) * scale - py);
	}

	export function zoomBy(factor: number): void {
		zoomAt(cssW / 2, cssH / 2, factor);
	}

	// The spacer resizes via Svelte after `scale` changes; scroll targets
	// beyond the old extent clamp unless applied after the DOM update.
	function queueScroll(left: number, top: number): void {
		requestAnimationFrame(() => {
			wrap.scrollLeft = Math.max(0, left);
			wrap.scrollTop = Math.max(0, top);
			invalidate();
		});
		invalidate();
	}

	function invalidate(): void {
		dirty = true;
	}

	function fitCanvas(): void {
		if (!canvas || !wrap) return;
		// clientWidth/Height exclude scrollbars, so the sticky canvas never
		// adds overflow of its own; the resize listener re-runs this whenever
		// browser zoom changes devicePixelRatio, keeping backing store,
		// pointer math, and grid aligned.
		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		cssW = wrap.clientWidth;
		cssH = wrap.clientHeight;
		canvas.style.width = `${cssW}px`;
		canvas.style.height = `${cssH}px`;
		canvas.width = Math.round(cssW * ratio);
		canvas.height = Math.round(cssH * ratio);
		ctx = canvas.getContext('2d');
		ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
		invalidate();
	}

	function draw(): void {
		raf = requestAnimationFrame(draw);
		if (!dirty || !ctx) return;
		dirty = false;

		ctx.fillStyle = VOID_BG;
		ctx.fillRect(0, 0, cssW, cssH);

		// Visible world rect for culling.
		const wMinX = offsetX();
		const wMaxX = wMinX + cssW / scale;
		const wMaxY = offsetY();
		const wMinY = wMaxY - cssH / scale;
		const s = scale;

		// Grid extent outline
		{
			const a = worldToScreen(0, gridH);
			ctx.strokeStyle = '#2a3038';
			ctx.strokeRect(a.sx + 0.5, a.sy + 0.5, gridW * s, gridH * s);
		}

		for (const [key, attrs] of cells) {
			const { x, y } = parseKey(key);
			if (x + 1 < wMinX || x > wMaxX || y + 1 < wMinY || y > wMaxY) continue;
			const color = renderLayer?.get(key) ?? cellColor(attrs, overlayKey, defByKey.get(overlayKey));
			if (!color) continue;
			const { sx, sy } = worldToScreen(x, y + 1);
			ctx.fillStyle = color;
			ctx.fillRect(sx, sy, s, s);
			if (attrs.door === 'true') {
				ctx.fillStyle = '#F5B301';
				ctx.fillRect(sx + s * 0.25, sy + s * 0.25, s * 0.5, s * 0.5);
			}
		}

		if (preview.size > 0) {
			ctx.fillStyle = 'rgba(59, 130, 246, 0.45)';
			for (const key of preview) {
				const { x, y } = parseKey(key);
				if (x + 1 < wMinX || x > wMaxX || y + 1 < wMinY || y > wMaxY) continue;
				const { sx, sy } = worldToScreen(x, y + 1);
				ctx.fillRect(sx, sy, s, s);
			}
		}

		if (highlight.size > 0) {
			ctx.strokeStyle = '#ef4444';
			ctx.lineWidth = Math.max(1, s * 0.12);
			for (const key of highlight) {
				const { x, y } = parseKey(key);
				if (x + 1 < wMinX || x > wMaxX || y + 1 < wMinY || y > wMaxY) continue;
				const { sx, sy } = worldToScreen(x, y + 1);
				ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
			}
			ctx.lineWidth = 1;
		}

		// Grid lines only when cells are big enough to matter; every 5th line
		// (a 5 ft survey square) is brighter for counting distance.
		if (s >= 6) {
			const x0 = Math.max(0, Math.floor(wMinX));
			const x1 = Math.min(gridW, Math.ceil(wMaxX));
			const y0 = Math.max(0, Math.floor(wMinY));
			const y1 = Math.min(gridH, Math.ceil(wMaxY));
			for (const [minor, style] of [
				[true, 'rgba(255,255,255,0.16)'],
				[false, 'rgba(255,255,255,0.32)']
			] as [boolean, string][]) {
				ctx.strokeStyle = style;
				ctx.beginPath();
				for (let x = x0; x <= x1; x++) {
					if (x % 5 === 0 === minor) continue;
					const p = worldToScreen(x, 0);
					ctx.moveTo(p.sx + 0.5, 0);
					ctx.lineTo(p.sx + 0.5, cssH);
				}
				for (let y = y0; y <= y1; y++) {
					if (y % 5 === 0 === minor) continue;
					const p = worldToScreen(0, y);
					ctx.moveTo(0, p.sy + 0.5);
					ctx.lineTo(cssW, p.sy + 0.5);
				}
				ctx.stroke();
			}
		}
	}

	function cellAt(e: PointerEvent | WheelEvent): { x: number; y: number } {
		const rect = canvas.getBoundingClientRect();
		return screenToCell(e.clientX - rect.left, e.clientY - rect.top);
	}

	function onPointerDown(e: PointerEvent): void {
		canvas.setPointerCapture(e.pointerId);
		lastPointer = { x: e.clientX, y: e.clientY };
		const wantsPan = mode === 'view' || e.button === 1 || spaceHeld;
		if (wantsPan) {
			panning = true;
		} else if (e.button === 0) {
			painting = true;
			dispatch('paintdown', cellAt(e));
		}
	}

	function onPointerMove(e: PointerEvent): void {
		if (panning && lastPointer) {
			wrap.scrollLeft -= e.clientX - lastPointer.x;
			wrap.scrollTop -= e.clientY - lastPointer.y;
			lastPointer = { x: e.clientX, y: e.clientY };
			invalidate();
			return;
		}
		const cell = cellAt(e);
		const ck = `${cell.x},${cell.y}`;
		if (painting) {
			dispatch('paintmove', cell);
			lastPointer = { x: e.clientX, y: e.clientY };
			return;
		}
		if (ck !== lastHoverCell) {
			lastHoverCell = ck;
			dispatch('hover', { ...cell, clientX: e.clientX, clientY: e.clientY });
		}
	}

	function onPointerUp(e: PointerEvent): void {
		if (painting) dispatch('paintup', cellAt(e));
		painting = false;
		panning = false;
		lastPointer = null;
	}

	function onPointerLeave(): void {
		lastHoverCell = null;
		dispatch('hoverend');
	}

	function onWheel(e: WheelEvent): void {
		// Plain wheel scrolls natively (the wrap is a scroll container);
		// ctrl/cmd+wheel zooms — mirroring how maps and image editors behave.
		// Pinch-zoom on trackpads arrives as ctrl+wheel too.
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
	}

	function onScroll(): void {
		invalidate();
	}

	function onKey(e: KeyboardEvent): void {
		if (e.code === 'Space') spaceHeld = e.type === 'keydown';
	}

	onMount(() => {
		fitCanvas();
		resizeObserver = new ResizeObserver(() => fitCanvas());
		resizeObserver.observe(wrap);
		// Browser zoom changes devicePixelRatio without always resizing the
		// element — window resize does fire, so re-sync the backing store.
		window.addEventListener('resize', fitCanvas);
		fit();
		raf = requestAnimationFrame(draw);
	});

	onDestroy(() => {
		// onDestroy also fires after SSR render, where rAF doesn't exist.
		if (!browser) return;
		resizeObserver?.disconnect();
		window.removeEventListener('resize', fitCanvas);
		cancelAnimationFrame(raf);
	});
</script>

<svelte:window on:keydown={onKey} on:keyup={onKey} />

<div class="canvas-wrap" bind:this={wrap} on:scroll={onScroll}>
	<canvas
		bind:this={canvas}
		on:pointerdown={onPointerDown}
		on:pointermove={onPointerMove}
		on:pointerup={onPointerUp}
		on:pointerleave={onPointerLeave}
		on:wheel={onWheel}
		class:paint-cursor={mode !== 'view'}
	/>
	<div class="spacer" style="width:{spacerW}px; height:{spacerH}px" aria-hidden="true"></div>
</div>

<style>
	.canvas-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 420px;
		overflow: auto;
		background: #0d1117;
		border-radius: 0.5rem;
	}
	canvas {
		position: sticky;
		top: 0;
		left: 0;
		display: block;
		touch-action: none;
		cursor: grab;
		z-index: 1;
	}
	canvas.paint-cursor {
		cursor: crosshair;
	}
	.spacer {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}
</style>
