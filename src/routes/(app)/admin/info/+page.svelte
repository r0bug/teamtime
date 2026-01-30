<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let editingPost: typeof data.posts[0] | null = null;
	let viewingPost: typeof data.posts[0] | null = null;
	let loading = false;
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
</script>

<svelte:head>
	<title>Info & Posts - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div class="flex flex-wrap justify-between items-center mb-6 gap-4">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Info & Posts</h1>
			<p class="text-gray-600 mt-1">Create and manage informational posts for staff</p>
		</div>
		<button on:click={() => showCreateModal = true} class="btn-primary">
			+ New Post
		</button>
	</div>

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.message}
		</div>
	{/if}

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.error}
		</div>
	{/if}

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

	<!-- Posts Grid -->
	{#if filteredPosts.length === 0}
		<div class="card p-8 text-center">
			<svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
			<h3 class="text-lg font-medium text-gray-900 mb-1">No posts yet</h3>
			<p class="text-gray-500 mb-4">Create your first informational post for staff.</p>
			<button on:click={() => showCreateModal = true} class="btn-primary">
				Create Post
			</button>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredPosts as post}
				<div class="card hover:shadow-lg transition-shadow cursor-pointer {!post.isActive ? 'opacity-60' : ''}" on:click={() => viewingPost = post}>
					<div class="p-4">
						<div class="flex items-start justify-between mb-2">
							<span class="px-2 py-0.5 text-xs font-medium rounded-full {getCategoryStyle(post.category)}">
								{getCategoryLabel(post.category)}
							</span>
							<div class="flex items-center gap-2">
								{#if post.isPinned}
									<svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
										<path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v2h2a1 1 0 110 2h-1.586l-.707.707A1 1 0 0014 11v3.586l.707.707a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l.707-.707V11a1 1 0 00-.293-.707L5.586 9H4a1 1 0 110-2h2V5z" />
									</svg>
								{/if}
								{#if !post.isActive}
									<span class="text-xs text-gray-500">Draft</span>
								{/if}
							</div>
						</div>
						<h3 class="font-semibold text-gray-900 mb-2 line-clamp-2">{post.title}</h3>
						<p class="text-sm text-gray-600 mb-3 line-clamp-3">{truncateContent(post.content)}</p>
						<div class="flex items-center justify-between text-xs text-gray-500">
							<span>{post.authorName || 'Unknown'}</span>
							<span>{formatDate(post.createdAt)}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create Post Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Create Post</h2>
				<form method="POST" action="?/create" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showCreateModal = false;
						await update();
					};
				}} class="space-y-4">
					<div>
						<label for="title" class="label">Title</label>
						<input type="text" id="title" name="title" required class="input" placeholder="Post title..." />
					</div>
					<div>
						<label for="category" class="label">Category</label>
						<select id="category" name="category" class="input">
							{#each categories as cat}
								<option value={cat.value}>{cat.label}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="content" class="label">Content</label>
						<textarea
							id="content"
							name="content"
							required
							rows="10"
							class="input font-mono text-sm"
							placeholder="Write your post content here...

You can include:
- Contact information
- Step-by-step instructions
- Important policies
- Announcements"
						></textarea>
						<p class="text-xs text-gray-500 mt-1">Supports plain text. Use line breaks for formatting.</p>
					</div>
					<div>
						<label class="flex items-center">
							<input type="checkbox" name="isPinned" value="true" class="mr-2" />
							<span class="text-sm">Pin this post (shows at top)</span>
						</label>
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={() => showCreateModal = false} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Creating...' : 'Create Post'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- View Post Modal -->
{#if viewingPost}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<div class="flex items-start justify-between mb-4">
					<div>
						<span class="px-2 py-0.5 text-xs font-medium rounded-full {getCategoryStyle(viewingPost.category)}">
							{getCategoryLabel(viewingPost.category)}
						</span>
						{#if viewingPost.isPinned}
							<span class="ml-2 text-xs text-yellow-600">Pinned</span>
						{/if}
						{#if !viewingPost.isActive}
							<span class="ml-2 text-xs text-gray-500">(Draft)</span>
						{/if}
					</div>
					<button on:click={() => viewingPost = null} class="text-gray-400 hover:text-gray-600">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<h2 class="text-2xl font-bold text-gray-900 mb-2">{viewingPost.title}</h2>
				<div class="text-sm text-gray-500 mb-4">
					By {viewingPost.authorName || 'Unknown'} on {formatDate(viewingPost.createdAt)}
					{#if viewingPost.updatedAt && new Date(viewingPost.updatedAt) > new Date(viewingPost.createdAt)}
						<span class="ml-2">(Updated {formatDate(viewingPost.updatedAt)})</span>
					{/if}
				</div>
				<div class="prose prose-sm max-w-none mb-6">
					<pre class="whitespace-pre-wrap font-sans text-gray-700 bg-gray-50 p-4 rounded-lg">{viewingPost.content}</pre>
				</div>
				<div class="flex flex-wrap gap-2 pt-4 border-t">
					<button on:click={() => { if (viewingPost) editingPost = viewingPost; viewingPost = null; }} class="btn-secondary">
						Edit
					</button>
					<form method="POST" action="?/togglePin" use:enhance class="inline">
						<input type="hidden" name="postId" value={viewingPost.id} />
						<input type="hidden" name="isPinned" value={viewingPost.isPinned ? 'false' : 'true'} />
						<button type="submit" class="btn-secondary">
							{viewingPost.isPinned ? 'Unpin' : 'Pin'}
						</button>
					</form>
					<form method="POST" action="?/delete" use:enhance={() => {
						if (!confirm('Are you sure you want to delete this post?')) {
							return () => {};
						}
						return async ({ update }) => {
							viewingPost = null;
							await update();
						};
					}} class="inline ml-auto">
						<input type="hidden" name="postId" value={viewingPost.id} />
						<button type="submit" class="btn-danger">Delete</button>
					</form>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Post Modal -->
{#if editingPost}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Edit Post</h2>
				<form method="POST" action="?/update" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						editingPost = null;
						await update();
					};
				}} class="space-y-4">
					<input type="hidden" name="postId" value={editingPost.id} />
					<div>
						<label for="edit-title" class="label">Title</label>
						<input type="text" id="edit-title" name="title" required class="input" bind:value={editingPost.title} />
					</div>
					<div>
						<label for="edit-category" class="label">Category</label>
						<select id="edit-category" name="category" class="input" bind:value={editingPost.category}>
							{#each categories as cat}
								<option value={cat.value}>{cat.label}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="edit-content" class="label">Content</label>
						<textarea
							id="edit-content"
							name="content"
							required
							rows="10"
							class="input font-mono text-sm"
							bind:value={editingPost.content}
						></textarea>
					</div>
					<div class="flex gap-4">
						<label class="flex items-center">
							<input type="checkbox" name="isPinned" value="true" checked={editingPost.isPinned} class="mr-2" />
							<span class="text-sm">Pinned</span>
						</label>
						<label class="flex items-center">
							<input type="checkbox" name="isActive" value="true" checked={editingPost.isActive} class="mr-2" />
							<span class="text-sm">Active (visible to staff)</span>
						</label>
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={() => editingPost = null} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Saving...' : 'Save Changes'}
						</button>
					</div>
				</form>
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
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
