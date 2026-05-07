<script lang="ts">
	export let items: { label: string; value: number }[];
	export let max = 10;

	$: sorted = [...items].sort((a, b) => b.value - a.value).slice(0, max);
	$: maxValue = sorted.length ? Math.max(...sorted.map((i) => i.value), 1) : 1;

	function formatCurrency(n: number): string {
		if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
		return `$${n.toFixed(2)}`;
	}
</script>

{#if sorted.length === 0}
	<div class="text-sm text-gray-500 py-8 text-center">No items in this range.</div>
{:else}
	<div class="space-y-2">
		{#each sorted as it (it.label)}
			<div class="grid grid-cols-12 gap-2 items-center text-sm">
				<div class="col-span-5 truncate text-gray-700" title={it.label}>{it.label}</div>
				<div class="col-span-5 bg-gray-100 rounded h-3 overflow-hidden">
					<div class="bg-emerald-500 h-full" style="width: {(it.value / maxValue) * 100}%"></div>
				</div>
				<div class="col-span-2 text-right text-gray-600 tabular-nums">{formatCurrency(it.value)}</div>
			</div>
		{/each}
	</div>
{/if}
