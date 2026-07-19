<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { notify } from '$lib/notify';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { formatDateTime } from '$lib/utils';
	import type { PageData } from './$types';

	export let data: PageData;

	$: pending = data.pending;
	$: resolved = data.resolved;

	let processingId: string | null = null;
	let confirmApproveId: string | null = null;

	const statusBadge: Record<string, string> = {
		active: 'badge-danger',
		overturned: 'badge-gray',
		appealed: 'badge-warning',
		expired: 'badge-gray',
		pending: 'badge-warning'
	};

	const handleResult: SubmitFunction = () => {
		return async ({ result, update }) => {
			processingId = null;
			if (result.type === 'success') {
				const data = result.data as { message?: string } | undefined;
				notify.success(data?.message || 'Done');
			} else if (result.type === 'failure') {
				const data = result.data as { error?: string } | undefined;
				notify.error(data?.error || 'Action failed');
			}
			await update();
		};
	};
</script>

<svelte:head>
	<title>Demerit Review - TeamTime Admin</title>
</svelte:head>

<div class="max-w-4xl mx-auto p-4 space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">Demerit Review</h1>
		<p class="text-gray-600 mt-1">
			Auto-detected demerits wait here for review. Nothing is deducted and the employee is not
			notified until you approve. If the schedule was wrong, fix the schedule and dismiss.
		</p>
	</div>

	<div class="card">
		<div class="card-header flex items-center justify-between">
			<h2 class="font-semibold text-gray-900">Pending Review</h2>
			{#if pending.length > 0}
				<span class="badge-warning">{pending.length} pending</span>
			{/if}
		</div>
		<div class="card-body">
			{#if pending.length === 0}
				<p class="text-sm text-gray-500">No demerits waiting for review.</p>
			{:else}
				<ul class="divide-y divide-gray-100">
					{#each pending as d (d.id)}
						<li class="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
							<div class="flex-1 min-w-0">
								<p class="font-medium text-gray-900">{d.userName} — {d.title}</p>
								<p class="text-sm text-gray-600">{d.description}</p>
								<p class="text-xs text-gray-500 mt-1">
									Detected {formatDateTime(d.createdAt)} · {d.pointsDeducted} points if approved
								</p>
							</div>
							<div class="flex items-center gap-2 shrink-0">
								<form method="POST" action="?/approve" use:enhance={handleResult}>
									<input type="hidden" name="demeritId" value={d.id} />
									<button
										type="button"
										class="btn-danger btn-sm touch-target"
										disabled={processingId !== null}
										on:click={() => (confirmApproveId = d.id)}
									>
										Approve
									</button>
								</form>
								<form method="POST" action="?/dismiss" use:enhance={handleResult}>
									<input type="hidden" name="demeritId" value={d.id} />
									<button
										type="submit"
										class="btn-secondary btn-sm touch-target"
										disabled={processingId !== null}
										on:click={() => (processingId = d.id)}
									>
										Dismiss
									</button>
								</form>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>

	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold text-gray-900">Recent Demerits</h2>
		</div>
		<div class="card-body">
			{#if resolved.length === 0}
				<p class="text-sm text-gray-500">No demerit history.</p>
			{:else}
				<ul class="divide-y divide-gray-100">
					{#each resolved as d (d.id)}
						<li class="py-3 flex items-start gap-3">
							<span class={statusBadge[d.status] ?? 'badge-gray'}>{d.status}</span>
							<div class="flex-1 min-w-0">
								<p class="font-medium text-gray-900">{d.userName} — {d.title}</p>
								<p class="text-sm text-gray-600 break-words">{d.description}</p>
								<p class="text-xs text-gray-500 mt-1">{formatDateTime(d.createdAt)}</p>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<ConfirmDialog
	open={confirmApproveId !== null}
	title="Approve demerit?"
	message="This deducts points and sends the employee an SMS. Make sure the underlying schedule data was actually correct."
	confirmLabel="Approve"
	on:confirm={() => {
		const id = confirmApproveId;
		confirmApproveId = null;
		processingId = id;
		const input = document.querySelector(`form[action='?/approve'] input[value='${id}']`);
		input?.closest('form')?.requestSubmit();
	}}
	on:cancel={() => (confirmApproveId = null)}
/>
