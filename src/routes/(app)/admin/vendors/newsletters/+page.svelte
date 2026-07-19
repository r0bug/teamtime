<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	export let data: PageData;

	let confirmDeleteId: string | null = null;
	let deleteForm: HTMLFormElement;

	const fmtDate = (d: string | Date | null) =>
		d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
	// For date-only strings: anchor to local midnight so the day doesn't shift.
	const fmtDay = (d: string) =>
		new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<svelte:head><title>Vendor Newsletters — Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Vendor Newsletters</h1>
			<p class="text-gray-600 text-sm mt-1">
				Compose richer periodic mailings — sales charts, leaderboard, shoutouts, tips, events —
				emailed to all active vendors and published in the portal. For quick notices use
				<a href="/admin/vendors/announcements" class="text-primary-600 hover:underline">Vendor News</a>.
			</p>
		</div>
		<form method="POST" action="?/create" use:enhance>
			<button type="submit" class="btn-primary whitespace-nowrap">+ New newsletter</button>
		</form>
	</div>

	<div class="mt-6 flex flex-col gap-3">
		{#each data.newsletters as n (n.id)}
			<div class="card">
				<div class="card-body flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex items-center gap-2 flex-wrap">
							<a href="/admin/vendors/newsletters/{n.id}" class="font-semibold text-gray-900 hover:text-primary-600">{n.title}</a>
							{#if n.status === 'sent'}
								<span class="badge-success">Sent {fmtDate(n.sentAt)}</span>
								{#if n.publishToPortal}<span class="badge-primary">In portal</span>{/if}
							{:else}
								<span class="badge-warning">Draft</span>
								{#if n.scheduledSendAt}
									<span class="badge-primary">⏰ Sends {new Date(n.scheduledSendAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
								{/if}
								{#if n.recurrence === 'monthly'}<span class="badge-gray">Monthly</span>{/if}
							{/if}
						</div>
						<p class="text-xs text-gray-500 mt-1">
							Covers {fmtDay(n.periodStart)} – {fmtDay(n.periodEnd)} · created {fmtDate(n.createdAt)}
						</p>
					</div>
					<div class="flex gap-2 shrink-0">
						<a href="/admin/vendors/newsletters/{n.id}" class="btn-secondary btn-sm">{n.status === 'draft' ? 'Edit' : 'View'}</a>
						{#if n.status === 'draft'}
							<button class="btn-danger btn-sm" on:click={() => (confirmDeleteId = n.id)}>Delete</button>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<p class="text-gray-500 text-sm">No newsletters yet — create the first one.</p>
		{/each}
	</div>

	<form
		method="POST"
		action="?/delete"
		bind:this={deleteForm}
		class="hidden"
		use:enhance={() =>
			async ({ result }) => {
				if (result.type === 'success') {
					notify.success('Draft deleted');
					await invalidateAll();
				} else {
					notify.error('Could not delete draft');
				}
			}}
	>
		<input type="hidden" name="id" value={confirmDeleteId ?? ''} />
	</form>

	<ConfirmDialog
		open={confirmDeleteId !== null}
		title="Delete this draft?"
		message="The draft and its blocks will be permanently removed."
		confirmLabel="Delete"
		on:confirm={() => {
			deleteForm.requestSubmit();
			confirmDeleteId = null;
		}}
		on:cancel={() => (confirmDeleteId = null)}
	/>
</div>
