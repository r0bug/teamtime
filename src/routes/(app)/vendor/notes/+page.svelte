<script lang="ts">
	import NoteCard from '$lib/components/NoteCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>Notes - Vendor Portal</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Notes</h1>
		<p class="text-gray-600 mt-1">Notes from the team directed at you</p>
	</div>

	{#if data.notes.length === 0}
		<EmptyState title="No notes for you right now" />
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
			{#each data.notes as note (note.id)}
				<NoteCard {note} forYou={note.recipientUserId === data.currentUserId} />
			{/each}
		</div>
	{/if}
</div>
