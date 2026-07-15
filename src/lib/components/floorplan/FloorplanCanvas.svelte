<script lang="ts">
	// Grid renderer + pointer input. Rendering only — tool semantics live in
	// the page; this component turns pointer gestures into cell-coord events.
	//
	// Redraw strategy: full redraw per dirty-flagged rAF with viewport
	// culling over the sparse CellMap. At 7k-40k painted cells one fillRect
	// pass is comfortably under frame budget — do NOT add tiling/layer
	// caches without profiling a real problem first.
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { CellMap, AttrDef, Mode } from '$lib/floorplan/types';
	import { parseKey } from '$lib/floorplan/types';
	import {
		type Camera,
		zoomAt,
		pan,
		screenToCell,
		worldToScreen,
		fitToContent
	} from '$lib/floorplan/camera';
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
	let camera: Camera = { offsetX: 0, offsetY: 100, scale: 8 };
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

	export function fit(): void {
		camera = fitToContent(cells, cssW, cssH);
		invalidate();
	}

	export function getCamera(): Camera {
		return camera;
	}

	function invalidate(): void {
		dirty = true;
	}

	function fitCanvas(): void {
		if (!canvas || !wrap) return;
		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		cssW = wrap.clientWidth;
		cssH = wrap.clientHeight;
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
		const wMinX = camera.offsetX;
		const wMaxX = camera.offsetX + cssW / camera.scale;
		const wMaxY = camera.offsetY;
		const wMinY = camera.offsetY - cssH / camera.scale;
		const s = camera.scale;

		// Grid extent outline
		{
			const a = worldToScreen(camera, 0, gridH);
			ctx.strokeStyle = '#2a3038';
			ctx.strokeRect(a.sx + 0.5, a.sy + 0.5, gridW * s, gridH * s);
		}

		for (const [key, attrs] of cells) {
			const { x, y } = parseKey(key);
			if (x + 1 < wMinX || x > wMaxX || y + 1 < wMinY || y > wMaxY) continue;
			const color = renderLayer?.get(key) ?? cellColor(attrs, overlayKey, defByKey.get(overlayKey));
			if (!color) continue;
			const { sx, sy } = worldToScreen(camera, x, y + 1);
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
				const { sx, sy } = worldToScreen(camera, x, y + 1);
				ctx.fillRect(sx, sy, s, s);
			}
		}

		if (highlight.size > 0) {
			ctx.strokeStyle = '#ef4444';
			ctx.lineWidth = Math.max(1, s * 0.12);
			for (const key of highlight) {
				const { x, y } = parseKey(key);
				if (x + 1 < wMinX || x > wMaxX || y + 1 < wMinY || y > wMaxY) continue;
				const { sx, sy } = worldToScreen(camera, x, y + 1);
				ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
			}
			ctx.lineWidth = 1;
		}

		// Grid lines only when cells are big enough to matter.
		if (s >= 10) {
			ctx.strokeStyle = 'rgba(255,255,255,0.06)';
			ctx.beginPath();
			const x0 = Math.max(0, Math.floor(wMinX));
			const x1 = Math.min(gridW, Math.ceil(wMaxX));
			const y0 = Math.max(0, Math.floor(wMinY));
			const y1 = Math.min(gridH, Math.ceil(wMaxY));
			for (let x = x0; x <= x1; x++) {
				const p = worldToScreen(camera, x, 0);
				ctx.moveTo(p.sx + 0.5, 0);
				ctx.lineTo(p.sx + 0.5, cssH);
			}
			for (let y = y0; y <= y1; y++) {
				const p = worldToScreen(camera, 0, y);
				ctx.moveTo(0, p.sy + 0.5);
				ctx.lineTo(cssW, p.sy + 0.5);
			}
			ctx.stroke();
		}
	}

	function cellAt(e: PointerEvent | WheelEvent): { x: number; y: number } {
		const rect = canvas.getBoundingClientRect();
		return screenToCell(camera, e.clientX - rect.left, e.clientY - rect.top);
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
		const cell = cellAt(e);
		const ck = `${cell.x},${cell.y}`;
		if (panning && lastPointer) {
			camera = pan(camera, e.clientX - lastPointer.x, e.clientY - lastPointer.y);
			lastPointer = { x: e.clientX, y: e.clientY };
			invalidate();
			return;
		}
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
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		camera = zoomAt(camera, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
		invalidate();
	}

	function onKey(e: KeyboardEvent): void {
		if (e.code === 'Space') spaceHeld = e.type === 'keydown';
	}

	onMount(() => {
		fitCanvas();
		resizeObserver = new ResizeObserver(() => fitCanvas());
		resizeObserver.observe(wrap);
		camera = fitToContent(cells, cssW, cssH);
		raf = requestAnimationFrame(draw);
	});

	onDestroy(() => {
		// onDestroy also fires after SSR render, where rAF doesn't exist.
		if (!browser) return;
		resizeObserver?.disconnect();
		cancelAnimationFrame(raf);
	});
</script>

<svelte:window on:keydown={onKey} on:keyup={onKey} />

<div class="canvas-wrap" bind:this={wrap}>
	<canvas
		bind:this={canvas}
		on:pointerdown={onPointerDown}
		on:pointermove={onPointerMove}
		on:pointerup={onPointerUp}
		on:pointerleave={onPointerLeave}
		on:wheel={onWheel}
		class:paint-cursor={mode !== 'view'}
	/>
</div>

<style>
	.canvas-wrap {
		width: 100%;
		height: 100%;
		min-height: 420px;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
		cursor: grab;
		border-radius: 0.5rem;
	}
	canvas.paint-cursor {
		cursor: crosshair;
	}
</style>
