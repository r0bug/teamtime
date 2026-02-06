<script lang="ts">
	export let lines: number = 3;
	export let type: 'text' | 'card' | 'list' = 'text';
</script>

{#if type === 'card'}
	<div class="animate-pulse space-y-4">
		{#each Array(lines) as _}
			<div class="bg-white rounded-lg shadow p-4 space-y-3">
				<div class="h-4 bg-gray-200 rounded w-3/4"></div>
				<div class="h-3 bg-gray-200 rounded w-1/2"></div>
				<div class="h-3 bg-gray-200 rounded w-5/6"></div>
			</div>
		{/each}
	</div>
{:else if type === 'list'}
	<div class="animate-pulse space-y-3">
		{#each Array(lines) as _}
			<div class="flex items-center space-x-3 p-3">
				<div class="h-8 w-8 bg-gray-200 rounded-full"></div>
				<div class="flex-1 space-y-2">
					<div class="h-3 bg-gray-200 rounded w-3/4"></div>
					<div class="h-2 bg-gray-200 rounded w-1/2"></div>
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div class="animate-pulse space-y-3">
		{#each Array(lines) as _, i}
			<div class="h-3 bg-gray-200 rounded" style="width: {80 - i * 15}%"></div>
		{/each}
	</div>
{/if}
