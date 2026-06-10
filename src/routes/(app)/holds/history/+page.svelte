<script lang="ts">
	import { formatDate, formatDateTime } from '$lib/utils';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { HOLD_REASON_LABELS, HOLD_CLEARED_REASON_LABELS } from '$lib/holds';
	import type { PageData } from './$types';

	export let data: PageData;

	// Green for sale, gray for the rest.
	const variantFor = (r: string | null) => (r === 'sold' ? 'success' : r === 'cancelled' ? 'danger' : 'gray');
</script>

<svelte:head>
	<title>Holds History - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<div class="flex items-center justify-between mb-6 gap-3">
		<div>
			<h1 class="text-2xl font-bold">Holds History</h1>
			<p class="text-gray-600 mt-1">Cleared holds</p>
		</div>
		<a href="/holds" class="btn-secondary">Active Holds</a>
	</div>

	<div class="space-y-3">
		{#each data.holds as hold (hold.id)}
			<div class="card">
				<div class="card-body flex items-center gap-3">
					<div class="w-14 h-14 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
						<img src={hold.photoPath} alt="Item" class="w-full h-full object-cover" loading="lazy" />
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 flex-wrap">
							<h3 class="font-semibold text-gray-900 truncate">
								{hold.missingPrice && !hold.customerName ? 'Missing price' : hold.customerName || 'Hold'}
							</h3>
							{#if hold.clearedReason}
								<StatusBadge variant={variantFor(hold.clearedReason)} label={HOLD_CLEARED_REASON_LABELS[hold.clearedReason] ?? hold.clearedReason} />
							{/if}
						</div>
						<div class="text-sm text-gray-500 truncate">{HOLD_REASON_LABELS[hold.reason] ?? hold.reason}</div>
						{#if hold.itemDescription}
							<div class="text-sm text-gray-600 truncate">{hold.itemDescription}</div>
						{/if}
						<div class="mt-1 text-xs text-gray-400">
							{#if hold.clearedAt}Cleared {formatDateTime(hold.clearedAt)}{/if}
							{#if hold.clearedByName} by {hold.clearedByName}{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<EmptyState title="No cleared holds yet" />
		{/each}
	</div>
</div>
