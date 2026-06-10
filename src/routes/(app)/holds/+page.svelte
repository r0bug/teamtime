<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';
	import HoldCard from '$lib/components/HoldCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { HOLD_CLEARED_REASON_LABELS } from '$lib/holds';
	import type { PageData } from './$types';

	export let data: PageData;

	// Tick so the urgency clock (red / flashing) updates live.
	let now = new Date();
	let timer: ReturnType<typeof setInterval>;
	onMount(() => {
		timer = setInterval(() => (now = new Date()), 30_000);
	});
	onDestroy(() => clearInterval(timer));

	// Clear flow
	let clearingId: string | null = null;
	let clearingHold: PageData['holds'][number] | null = null;
	let submitting = false;

	function openClear(e: CustomEvent<{ id: string }>) {
		clearingId = e.detail.id;
		clearingHold = data.holds.find((h) => h.id === clearingId) ?? null;
	}

	function closeClear() {
		if (submitting) return;
		clearingId = null;
		clearingHold = null;
	}

	// Offer the contextually-relevant clear reasons first.
	$: clearReasons = clearingHold?.missingPrice
		? (['price_received', 'returned_to_shelf', 'cancelled'] as const)
		: (['sold', 'returned_to_shelf', 'cancelled'] as const);

	async function clearHold(reason: string) {
		if (!clearingId) return;
		submitting = true;
		try {
			const res = await fetch(`/api/holds/${clearingId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clear', clearedReason: reason })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Failed to clear hold');
			}
			notify.success('Hold cleared');
			clearingId = null;
			clearingHold = null;
			await invalidateAll();
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Failed to clear hold');
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Customer Holds - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<div class="flex items-center justify-between mb-6 gap-3">
		<div>
			<h1 class="text-2xl font-bold">Customer Holds</h1>
			<p class="text-gray-600 mt-1">{data.holds.length} active</p>
		</div>
		<div class="flex items-center gap-2">
			<a href="/holds/history" class="btn-secondary">History</a>
			<a href="/holds/new" class="btn-primary">
				<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				New Hold
			</a>
		</div>
	</div>

	<div class="space-y-3">
		{#each data.holds as hold (hold.id)}
			<HoldCard {hold} {now} showClear on:clear={openClear} />
		{:else}
			<EmptyState title="No active holds">
				<a href="/holds/new" class="btn-primary">Create a Hold</a>
			</EmptyState>
		{/each}
	</div>
</div>

<Modal open={clearingId !== null} title="Clear hold" size="sm" on:close={closeClear}>
	<p class="text-sm text-gray-600 mb-4">How was this hold resolved?</p>
	<div class="space-y-2">
		{#each clearReasons as reason}
			<button
				type="button"
				class="btn-secondary w-full justify-start"
				disabled={submitting}
				on:click={() => clearHold(reason)}
			>
				{HOLD_CLEARED_REASON_LABELS[reason]}
			</button>
		{/each}
	</div>
	{#if submitting}
		<div class="flex items-center gap-2 text-sm text-gray-500 mt-3">
			<Spinner size="sm" /> Clearing…
		</div>
	{/if}
</Modal>
