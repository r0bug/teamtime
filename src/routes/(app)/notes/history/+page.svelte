<script lang="ts">
	import { formatDateTime } from '$lib/utils';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>Notes History - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<div class="flex items-center justify-between mb-6 gap-3">
		<div>
			<h1 class="text-2xl font-bold">Notes History</h1>
			<p class="text-gray-600 mt-1">Removed notes</p>
		</div>
		<a href="/notes" class="btn-secondary">Board</a>
	</div>

	<div class="space-y-3">
		{#each data.notes as note (note.id)}
			<div class="card">
				<div class="card-body flex items-start gap-3">
					{#if note.photoPath && note.photoPath.startsWith('/uploads/')}
						<a href={note.photoPath} target="_blank" rel="noopener" class="flex-shrink-0">
							<img src={note.photoPath} alt="Note" class="w-14 h-14 rounded-lg object-cover border" loading="lazy" />
						</a>
					{/if}
					<div class="flex-1 min-w-0">
						<div class="mb-1">
							{#if note.recipientName}
								<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">For {note.recipientName}</span>
							{:else if note.recipientGroup === 'all_vendors'}
								<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">All vendors</span>
							{:else}
								<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">All staff</span>
							{/if}
						</div>
						{#if note.body}
							<p class="text-gray-800 whitespace-pre-wrap break-words text-sm line-clamp-3">{note.body}</p>
						{:else}
							<p class="text-gray-400 text-sm italic">Photo note</p>
						{/if}
						<div class="mt-1 text-xs text-gray-400">
							{#if note.createdByName}By {note.createdByName} · {/if}Created {formatDateTime(note.createdAt)}
							{#if note.deletedAt} · Removed {formatDateTime(note.deletedAt)}{/if}
							{#if note.deletedByName} by {note.deletedByName}{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<EmptyState title="No removed notes yet" />
		{/each}
	</div>
</div>
