<script lang="ts">
	export let data: { date: string; total: number }[];
	export let height = 180;

	$: maxValue = data.length ? Math.max(...data.map((d) => d.total), 1) : 1;
	$: barWidth = data.length ? Math.max(2, Math.min(40, 600 / data.length - 2)) : 0;

	function formatCurrency(n: number): string {
		if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
		return `$${n.toFixed(0)}`;
	}
</script>

{#if data.length === 0}
	<div class="text-sm text-gray-500 py-8 text-center">No sales in this range.</div>
{:else}
	<div class="relative">
		<svg viewBox="0 0 600 {height}" class="w-full" preserveAspectRatio="none">
			{#each [0.25, 0.5, 0.75, 1] as f}
				<line x1="0" x2="600" y1={height - height * f} y2={height - height * f} stroke="#e5e7eb" stroke-width="1" />
			{/each}
			{#each data as d, i (d.date)}
				{@const x = (i + 0.5) * (600 / data.length) - barWidth / 2}
				{@const h = (d.total / maxValue) * (height - 20)}
				<rect x={x} y={height - h} width={barWidth} height={h} fill="#2563eb" rx="1">
					<title>{d.date}: {formatCurrency(d.total)}</title>
				</rect>
			{/each}
		</svg>
		<div class="flex justify-between text-xs text-gray-500 mt-1 px-1">
			<span>{data[0]?.date}</span>
			{#if data.length > 1}<span>{data[data.length - 1]?.date}</span>{/if}
		</div>
		<div class="absolute top-0 left-0 text-xs text-gray-400">{formatCurrency(maxValue)}</div>
	</div>
{/if}
