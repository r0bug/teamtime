<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';

	export let data: PageData;

	let editing: (typeof data.announcements)[number] | null = null;
	let showForm = false;

	function startNew() {
		editing = null;
		showForm = true;
	}
	function startEdit(a: (typeof data.announcements)[number]) {
		editing = a;
		showForm = true;
	}
	function expiresValue(a: (typeof data.announcements)[number] | null): string {
		if (!a?.expiresAt) return '';
		return new Date(a.expiresAt).toISOString().slice(0, 10);
	}
	const fmtDate = (d: string | Date) =>
		new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<svelte:head><title>Vendor News — Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Vendor News</h1>
			<p class="text-gray-600 text-sm mt-1">
				Announcements vendors see in the portal. <strong>Pinned</strong> ones also show as a
				banner on every portal page until the vendor dismisses them.
			</p>
		</div>
		<button class="btn-primary" on:click={startNew}>+ New announcement</button>
	</div>

	{#if showForm}
		<form
			method="POST"
			action="?/save"
			class="card mt-6"
			use:enhance={() =>
				async ({ result, update }) => {
					if (result.type === 'success') {
						notify.success('Announcement saved');
						showForm = false;
						await invalidateAll();
					} else {
						await update();
						notify.error('Could not save — check the fields');
					}
				}}
		>
			<div class="card-body flex flex-col gap-3">
				<input type="hidden" name="id" value={editing?.id ?? ''} />
				<div>
					<label class="label" for="annTitle">Title</label>
					<input id="annTitle" name="title" class="input" required maxlength="120" value={editing?.title ?? ''} />
				</div>
				<div>
					<label class="label" for="annBody">Message</label>
					<textarea id="annBody" name="body" class="input" rows="5" required
						placeholder="What vendors need to know. Line breaks are kept.">{editing?.body ?? ''}</textarea>
				</div>
				<div class="flex flex-wrap items-end gap-4">
					<label class="flex items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" name="pinned" checked={editing?.pinned ?? false} />
						Pin as banner on every portal page
					</label>
					<div>
						<label class="label" for="annExpires">Auto-expire on (optional)</label>
						<input id="annExpires" name="expiresAt" type="date" class="input" value={expiresValue(editing)} />
					</div>
				</div>
				<div class="flex gap-2">
					<button type="submit" class="btn-primary">{editing ? 'Save changes' : 'Publish'}</button>
					<button type="button" class="btn-ghost" on:click={() => (showForm = false)}>Cancel</button>
				</div>
			</div>
		</form>
	{/if}

	<div class="mt-6 flex flex-col gap-3">
		{#each data.announcements as a (a.id)}
			<div class="card {a.active ? '' : 'opacity-60'}">
				<div class="card-body">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<h2 class="font-semibold text-gray-900">{a.title}</h2>
								{#if a.pinned && a.active}<span class="badge-warning">Pinned</span>{/if}
								{#if !a.active}<span class="badge-gray">Archived</span>{/if}
								{#if a.expiresAt}<span class="badge-gray">Expires {fmtDate(a.expiresAt)}</span>{/if}
							</div>
							<p class="text-sm text-gray-700 mt-1 whitespace-pre-line">{a.body}</p>
							<p class="text-xs text-gray-500 mt-2">Published {fmtDate(a.publishedAt)}</p>
						</div>
						<div class="flex flex-col gap-1 shrink-0">
							<button class="btn-secondary btn-sm" on:click={() => startEdit(a)}>Edit</button>
							<form method="POST" action="?/togglePinned" use:enhance>
								<input type="hidden" name="id" value={a.id} />
								<input type="hidden" name="pinned" value={String(!a.pinned)} />
								<button type="submit" class="btn-ghost btn-sm w-full">{a.pinned ? 'Unpin' : 'Pin'}</button>
							</form>
							<form method="POST" action="?/toggleActive" use:enhance>
								<input type="hidden" name="id" value={a.id} />
								<input type="hidden" name="active" value={String(!a.active)} />
								<button type="submit" class="btn-ghost btn-sm w-full">{a.active ? 'Archive' : 'Restore'}</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<p class="text-gray-500 text-sm">No announcements yet — post the first one.</p>
		{/each}
	</div>
</div>
