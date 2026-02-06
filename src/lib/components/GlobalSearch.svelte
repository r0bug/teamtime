<script lang="ts">
	import { showGlobalSearch } from '$lib/stores/shortcuts';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let query = '';
	let results: Array<{ type: string; id: string; title: string; subtitle?: string; href: string }> = [];
	let loading = false;
	let selectedIndex = 0;
	let inputEl: HTMLInputElement;

	$: if ($showGlobalSearch && browser) {
		query = '';
		results = [];
		selectedIndex = 0;
		// Focus input after render
		setTimeout(() => inputEl?.focus(), 50);
	}

	async function search() {
		if (query.length < 2) {
			results = [];
			return;
		}

		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
			if (res.ok) {
				results = await res.json();
				selectedIndex = 0;
			}
		} catch {
			results = [];
		}
		loading = false;
	}

	let debounceTimer: ReturnType<typeof setTimeout>;
	function handleInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(search, 200);
	}

	function navigate(href: string) {
		$showGlobalSearch = false;
		goto(href);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter' && results[selectedIndex]) {
			e.preventDefault();
			navigate(results[selectedIndex].href);
		} else if (e.key === 'Escape') {
			$showGlobalSearch = false;
		}
	}

	function typeIcon(type: string): string {
		const icons: Record<string, string> = {
			user: 'U',
			task: 'T',
			message: 'M'
		};
		return icons[type] || '?';
	}

	function typeColor(type: string): string {
		const colors: Record<string, string> = {
			user: 'bg-blue-100 text-blue-700',
			task: 'bg-green-100 text-green-700',
			message: 'bg-purple-100 text-purple-700'
		};
		return colors[type] || 'bg-gray-100 text-gray-700';
	}
</script>

{#if $showGlobalSearch}
	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50" on:click={() => $showGlobalSearch = false} on:keydown={(e) => e.key === 'Escape' && ($showGlobalSearch = false)} role="dialog" tabindex="-1">
		<div class="bg-white rounded-lg shadow-2xl w-full max-w-lg mx-4" on:click|stopPropagation role="presentation">
			<div class="p-3 border-b flex items-center gap-2">
				<svg class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					on:input={handleInput}
					on:keydown={handleKeydown}
					type="text"
					placeholder="Search users, tasks, messages..."
					class="flex-1 outline-none text-sm"
				/>
				<kbd class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border">Esc</kbd>
			</div>

			{#if loading}
				<div class="p-4 text-center text-sm text-gray-500">Searching...</div>
			{:else if results.length > 0}
				<div class="max-h-80 overflow-y-auto">
					{#each results as result, i}
						<button
							class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
							class:bg-blue-50={i === selectedIndex}
							on:click={() => navigate(result.href)}
						>
							<span class="w-6 h-6 rounded flex items-center justify-center text-xs font-bold {typeColor(result.type)}">
								{typeIcon(result.type)}
							</span>
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium truncate">{result.title}</div>
								{#if result.subtitle}
									<div class="text-xs text-gray-500 truncate">{result.subtitle}</div>
								{/if}
							</div>
							<span class="text-xs text-gray-400 capitalize">{result.type}</span>
						</button>
					{/each}
				</div>
			{:else if query.length >= 2}
				<div class="p-4 text-center text-sm text-gray-500">No results found</div>
			{:else}
				<div class="p-4 text-center text-sm text-gray-400">Type at least 2 characters to search</div>
			{/if}
		</div>
	</div>
{/if}
