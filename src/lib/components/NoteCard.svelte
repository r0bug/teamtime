<!--
  NoteCard.svelte — a single staff post-it note. Used on the notes board and the
  dashboard. Yellow sticky-note styling; shows the optional recipient, body text,
  and/or a photo of a hand-written note.

  Props:
  - note: the note record
  - forYou: highlight (this note is directed at the current user)
  - showDelete: show a delete button that dispatches a `delete` event
  - compact: tighter layout for the dashboard
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { formatRelativeTime } from '$lib/utils';
	import { isUploadPath } from '$lib/uploads';

	export let note: {
		id: string;
		body: string | null;
		photoPath: string | null;
		createdAt: string | Date;
		createdByName?: string | null;
		recipientGroup?: string | null;
		recipientName?: string | null;
	};
	export let forYou = false;
	export let showDelete = false;
	export let compact = false;

	const dispatch = createEventDispatcher<{ delete: { id: string } }>();

	// Only ever render local upload paths (guards against crafted href values).
	$: safePhoto = isUploadPath(note.photoPath) ? note.photoPath : null;
</script>

<div
	class="relative rounded-lg border border-yellow-300 bg-yellow-100 shadow-sm {compact ? 'p-3' : 'p-4'}
		{forYou ? 'ring-2 ring-amber-500' : ''}"
>
	{#if showDelete}
		<button
			type="button"
			class="absolute top-1.5 right-1.5 text-yellow-700/60 hover:text-red-600 rounded p-1"
			on:click={() => dispatch('delete', { id: note.id })}
			aria-label="Delete note"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	{/if}

	<div class="mb-2">
		{#if note.recipientName}
			<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
				For {note.recipientName}{#if forYou} (you){/if}
			</span>
		{:else if note.recipientGroup === 'all_vendors'}
			<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900">
				All vendors
			</span>
		{:else}
			<span class="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-800">
				All staff
			</span>
		{/if}
	</div>

	{#if note.body}
		<p class="text-gray-900 whitespace-pre-wrap break-words {compact ? 'text-sm' : ''}">{note.body}</p>
	{/if}

	{#if safePhoto}
		<a href={safePhoto} target="_blank" rel="noopener" class="block mt-2">
			<img
				src={safePhoto}
				alt="Hand-written note"
				class="rounded-md border border-yellow-300 max-h-48 w-auto object-contain bg-white"
				loading="lazy"
			/>
		</a>
	{/if}

	<div class="mt-3 text-xs text-yellow-800/80">
		{#if note.createdByName}{note.createdByName} · {/if}{formatRelativeTime(note.createdAt)}
	</div>
</div>
