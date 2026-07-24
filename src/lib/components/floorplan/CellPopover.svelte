<script lang="ts">
	// View-mode hover popover: builder attrs immediately, connector data
	// (rent/sales, each source labeled) debounced via /resolve.
	import { onDestroy } from 'svelte';
	import Spinner from '$lib/components/Spinner.svelte';

	export let planId: string;
	export let x: number;
	export let y: number;
	export let attrs: Record<string, string> = {};
	/** anchor position in viewport coords */
	export let clientX = 0;
	export let clientY = 0;

	let sources: Record<string, Record<string, unknown> | null> | null = null;
	let loading = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let seq = 0;

	const RESOLVE_DEBOUNCE_MS = 250;

	$: planId, x, y, schedule();

	function schedule(): void {
		if (timer) clearTimeout(timer);
		sources = null;
		// Only cells with a joinable attribute get connector data; vendor_id
		// is the only join key today, so skip the fetch when it's absent.
		if (attrs.vendor_id === undefined) {
			loading = false;
			return;
		}
		loading = true;
		const mySeq = ++seq;
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/floorplan/${planId}/cell/${x}/${y}/resolve`);
				if (mySeq !== seq) return; // stale hover
				if (res.ok) {
					const data = await res.json();
					sources = data.sources ?? {};
				}
			} catch {
				// popover data is best-effort; builder attrs are already shown
			} finally {
				if (mySeq === seq) loading = false;
			}
		}, RESOLVE_DEBOUNCE_MS);
	}

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	function fmt(v: unknown): string {
		if (typeof v === 'number') return v % 1 === 0 ? String(v) : v.toFixed(2);
		if (typeof v === 'boolean') return v ? 'yes' : 'no';
		return String(v ?? '—');
	}
</script>

<div
	class="fixed z-40 pointer-events-none max-w-xs rounded-lg border border-gray-700 bg-gray-900/95 p-3 text-xs text-gray-100 shadow-xl"
	style="left: {Math.min(clientX + 14, window.innerWidth - 280)}px; top: {Math.min(clientY + 14, window.innerHeight - 200)}px"
>
	<div class="font-semibold text-gray-300 mb-1">Cell ({x}, {y})</div>
	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
		{#each Object.entries(attrs) as [key, value]}
			<dt class="text-gray-400">{key}</dt>
			<dd class="font-mono">{value}</dd>
		{/each}
	</dl>

	{#if loading}
		<div class="mt-2 flex items-center gap-2 text-gray-400"><Spinner size="sm" /> resolving…</div>
	{:else if sources}
		{#each Object.entries(sources) as [label, data]}
			<div class="mt-2 border-t border-gray-700 pt-1.5">
				<div class="font-semibold text-primary-400">{label}</div>
				{#if data && !('error' in data)}
					<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
						{#each Object.entries(data) as [field, value]}
							<dt class="text-gray-400">{field}</dt>
							<dd class="font-mono">{fmt(value)}</dd>
						{/each}
					</dl>
				{:else if data && 'error' in data}
					<div class="text-red-400">{data.error}</div>
				{:else}
					<div class="text-gray-500">no data</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
