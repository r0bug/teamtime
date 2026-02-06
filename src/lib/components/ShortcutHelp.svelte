<script lang="ts">
	import { shortcuts, showShortcutHelp } from '$lib/stores/shortcuts';

	function close() {
		$showShortcutHelp = false;
	}

	// Group shortcuts by category
	$: grouped = $shortcuts.reduce((acc, s) => {
		if (!acc[s.category]) acc[s.category] = [];
		acc[s.category].push(s);
		return acc;
	}, {} as Record<string, typeof $shortcuts>);
</script>

{#if $showShortcutHelp}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" on:click={close} on:keydown={(e) => e.key === 'Escape' && close()} role="dialog" tabindex="-1">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" on:click|stopPropagation role="presentation">
			<div class="p-4 border-b flex items-center justify-between">
				<h2 class="text-lg font-semibold">Keyboard Shortcuts</h2>
				<button on:click={close} class="text-gray-400 hover:text-gray-600">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="p-4 space-y-4">
				{#each Object.entries(grouped) as [category, items]}
					<div>
						<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{category}</h3>
						<div class="space-y-1">
							{#each items as shortcut}
								<div class="flex items-center justify-between py-1">
									<span class="text-sm text-gray-700">{shortcut.description}</span>
									<kbd class="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-600">
										{shortcut.key}
									</kbd>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
