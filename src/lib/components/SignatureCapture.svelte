<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import SignaturePad from 'signature_pad';

	const dispatch = createEventDispatcher<{ change: { isEmpty: boolean } }>();

	let canvas: HTMLCanvasElement;
	let pad: SignaturePad | null = null;
	let resizeObserver: ResizeObserver | null = null;

	export function clear() {
		pad?.clear();
		dispatch('change', { isEmpty: true });
	}

	export function isEmpty(): boolean {
		return pad?.isEmpty() ?? true;
	}

	export function toDataUrl(): string | null {
		if (!pad || pad.isEmpty()) return null;
		return pad.toDataURL('image/png');
	}

	function fitCanvas() {
		if (!canvas) return;
		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width * ratio;
		canvas.height = rect.height * ratio;
		const ctx = canvas.getContext('2d');
		ctx?.scale(ratio, ratio);
		pad?.clear();
	}

	onMount(() => {
		pad = new SignaturePad(canvas, {
			minWidth: 0.7,
			maxWidth: 2.5,
			penColor: '#111827'
		});
		pad.addEventListener('endStroke', () => dispatch('change', { isEmpty: pad?.isEmpty() ?? true }));
		fitCanvas();
		resizeObserver = new ResizeObserver(() => fitCanvas());
		resizeObserver.observe(canvas);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		pad?.off();
	});
</script>

<div class="signature-capture border-2 border-dashed border-gray-300 rounded-lg bg-white">
	<canvas bind:this={canvas} class="block w-full h-48 touch-none"></canvas>
</div>

<style>
	canvas {
		touch-action: none;
	}
</style>
