<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';
	import NoteCard from '$lib/components/NoteCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let deletingId: string | null = null;
	let deleting = false;

	function askDelete(e: CustomEvent<{ id: string }>) {
		deletingId = e.detail.id;
	}

	async function confirmDelete() {
		if (!deletingId) return;
		deleting = true;
		try {
			const res = await fetch(`/api/notes/${deletingId}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Failed to delete note');
			}
			notify.success('Note removed');
			deletingId = null;
			await invalidateAll();
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Failed to delete note');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>Notes - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<div class="flex items-center justify-between mb-6 gap-3">
		<div>
			<h1 class="text-2xl font-bold">Notes</h1>
			<p class="text-gray-600 mt-1">{data.notes.length} on the board</p>
		</div>
		<div class="flex items-center gap-2">
			<a href="/notes/history" class="btn-secondary">History</a>
			<a href="/notes/new" class="btn-primary">
				<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				New Note
			</a>
		</div>
	</div>

	{#if data.notes.length === 0}
		<EmptyState title="No notes on the board">
			<a href="/notes/new" class="btn-primary">Add a Note</a>
		</EmptyState>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
			{#each data.notes as note (note.id)}
				<NoteCard
					{note}
					forYou={note.recipientUserId === data.currentUserId}
					showDelete
					on:delete={askDelete}
				/>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDialog
	open={deletingId !== null}
	title="Remove note?"
	message="It will be moved to history with your name and the time."
	confirmLabel="Remove"
	loading={deleting}
	on:confirm={confirmDelete}
	on:cancel={() => (deletingId = null)}
/>
