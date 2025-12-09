<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let viewingPost: typeof data.posts[0] | null = null;
	let filterCategory = '';

	const categories = [
		{ value: 'general', label: 'General', color: 'bg-gray-100 text-gray-800' },
		{ value: 'contacts', label: 'Contacts', color: 'bg-blue-100 text-blue-800' },
		{ value: 'how-to', label: 'How-To', color: 'bg-green-100 text-green-800' },
		{ value: 'policy', label: 'Policy', color: 'bg-yellow-100 text-yellow-800' },
		{ value: 'announcement', label: 'Announcement', color: 'bg-red-100 text-red-800' }
	];

	function getCategoryStyle(category: string) {
		const cat = categories.find(c => c.value === category);
		return cat?.color || 'bg-gray-100 text-gray-800';
	}

	function getCategoryLabel(category: string) {
		const cat = categories.find(c => c.value === category);
		return cat?.label || category;
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function truncateContent(content: string, maxLength = 150) {
		if (content.length <= maxLength) return content;
		return content.substring(0, maxLength) + '...';
	}

	$: filteredPosts = filterCategory
		? data.posts.filter(p => p.category === filterCategory)
		: data.posts;

	// Group posts: pinned first, then by category
	$: pinnedPosts = filteredPosts.filter(p => p.isPinned);
	$: regularPosts = filteredPosts.filter(p => !p.isPinned);
</script>

<svelte:head>
	<title>Information - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Information</h1>
		<p class="text-gray-600 mt-1">Important posts and resources from management</p>
	</div>

	<!-- Category Filter -->
	<div class="mb-6 flex flex-wrap gap-2">
		<button
			on:click={() => filterCategory = ''}
			class="px-3 py-1.5 text-sm rounded-full transition-colors {filterCategory === '' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			All
		</button>
		{#each categories as cat}
			<button
				on:click={() => filterCategory = cat.value}
				class="px-3 py-1.5 text-sm rounded-full transition-colors {filterCategory === cat.value ? 'bg-primary-600 text-white' : cat.color + ' hover:opacity-80'}"
			>
				{cat.label}
			</button>
		{/each}
	</div>

	<!-- Posts List -->
	{#if filteredPosts.length === 0}
		<div class="card p-8 text-center">
			<svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
			<h3 class="text-lg font-medium text-gray-900 mb-1">No posts available</h3>
			<p class="text-gray-500">Check back later for updates from management.</p>
		</div>
	{:else}
		<!-- Pinned Posts Section -->
		{#if pinnedPosts.length > 0}
			<div class="mb-6">
				<h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
					<svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
						<path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v2h2a1 1 0 110 2h-1.586l-.707.707A1 1 0 0014 11v3.586l.707.707a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l.707-.707V11a1 1 0 00-.293-.707L5.586 9H4a1 1 0 110-2h2V5z" />
					</svg>
					Pinned
				</h2>
				<div class="space-y-3">
					{#each pinnedPosts as post}
						<button
							on:click={() => viewingPost = post}
							class="w-full text-left card hover:shadow-md transition-shadow border-l-4 border-yellow-400"
						>
							<div class="p-4">
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 mb-1">
											<span class="px-2 py-0.5 text-xs font-medium rounded-full {getCategoryStyle(post.category)}">
												{getCategoryLabel(post.category)}
											</span>
										</div>
										<h3 class="font-semibold text-gray-900 mb-1">{post.title}</h3>
										<p class="text-sm text-gray-600 line-clamp-2">{truncateContent(post.content)}</p>
									</div>
									<div class="text-xs text-gray-500 whitespace-nowrap">
										{formatDate(post.createdAt)}
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Regular Posts Section -->
		{#if regularPosts.length > 0}
			<div>
				{#if pinnedPosts.length > 0}
					<h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">All Posts</h2>
				{/if}
				<div class="space-y-3">
					{#each regularPosts as post}
						<button
							on:click={() => viewingPost = post}
							class="w-full text-left card hover:shadow-md transition-shadow"
						>
							<div class="p-4">
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 mb-1">
											<span class="px-2 py-0.5 text-xs font-medium rounded-full {getCategoryStyle(post.category)}">
												{getCategoryLabel(post.category)}
											</span>
										</div>
										<h3 class="font-semibold text-gray-900 mb-1">{post.title}</h3>
										<p class="text-sm text-gray-600 line-clamp-2">{truncateContent(post.content)}</p>
									</div>
									<div class="text-xs text-gray-500 whitespace-nowrap">
										{formatDate(post.createdAt)}
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- View Post Modal -->
{#if viewingPost}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" on:click={() => viewingPost = null} role="dialog" aria-modal="true" aria-labelledby="post-title">
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
			<div class="p-6">
				<div class="flex items-start justify-between mb-4">
					<div class="flex items-center gap-2">
						<span class="px-2 py-0.5 text-xs font-medium rounded-full {getCategoryStyle(viewingPost.category)}">
							{getCategoryLabel(viewingPost.category)}
						</span>
						{#if viewingPost.isPinned}
							<svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
								<path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v2h2a1 1 0 110 2h-1.586l-.707.707A1 1 0 0014 11v3.586l.707.707a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l.707-.707V11a1 1 0 00-.293-.707L5.586 9H4a1 1 0 110-2h2V5z" />
							</svg>
						{/if}
					</div>
					<button on:click={() => viewingPost = null} class="text-gray-400 hover:text-gray-600 p-1">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<h2 id="post-title" class="text-2xl font-bold text-gray-900 mb-2">{viewingPost.title}</h2>
				<div class="text-sm text-gray-500 mb-4">
					{#if viewingPost.authorName}
						By {viewingPost.authorName} &bull;
					{/if}
					{formatDate(viewingPost.createdAt)}
					{#if viewingPost.updatedAt && new Date(viewingPost.updatedAt) > new Date(viewingPost.createdAt)}
						<span class="ml-1">(Updated {formatDate(viewingPost.updatedAt)})</span>
					{/if}
				</div>
				<div class="prose prose-sm max-w-none">
					<pre class="whitespace-pre-wrap font-sans text-gray-700 bg-gray-50 p-4 rounded-lg">{viewingPost.content}</pre>
				</div>
				<div class="mt-6 pt-4 border-t">
					<button on:click={() => viewingPost = null} class="btn-secondary">
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
