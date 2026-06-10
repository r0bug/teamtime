<!--
  HoldCard.svelte — one customer hold rendered as a card. Used on the holds
  queue and the dashboard. The timestamp pill turns red 24h past the urgency
  anchor and flashes red after 48h (see $lib/holds.holdUrgency).

  Props:
  - hold: the hold record (must include urgencyAnchor as an ISO string)
  - now: current time (passed in so the parent can tick it for live flashing)
  - showClear: show a "Clear" button that dispatches a `clear` event
  - compact: tighter layout for the dashboard
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { formatRelativeTime, formatDate } from '$lib/utils';
	import { holdUrgency, HOLD_REASON_LABELS } from '$lib/holds';
	import { isUploadPath } from '$lib/uploads';

	export let hold: {
		id: string;
		reason: string;
		missingPrice: boolean;
		customerName: string | null;
		customerPhone?: string | null;
		itemDescription: string | null;
		pickupDate: string | Date | null;
		photoPath: string;
		urgencyAnchor: string;
		createdAt: string | Date;
		createdByName?: string | null;
	};
	export let now: Date = new Date();
	export let showClear = false;
	export let compact = false;

	const dispatch = createEventDispatcher<{ clear: { id: string } }>();

	$: urgency = holdUrgency(hold.urgencyAnchor, now);
	$: title = hold.missingPrice && !hold.customerName ? 'Missing price' : hold.customerName || 'Hold';
	// Only ever render local upload paths (guards against crafted src values).
	$: safePhoto = isUploadPath(hold.photoPath) ? hold.photoPath : null;
</script>

<div class="card {urgency === 'red' ? 'ring-2 ring-red-400' : ''} {urgency === 'flash' ? 'ring-2 ring-red-500 animate-pulse' : ''}">
	<div class="card-body flex items-center gap-3 {compact ? 'p-3' : ''}">
		<!-- Photo -->
		<div class="{compact ? 'w-14 h-14' : 'w-16 h-16'} flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
			{#if safePhoto}
				<img src={safePhoto} alt={title} class="w-full h-full object-cover" loading="lazy" />
			{/if}
		</div>

		<!-- Details -->
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2 flex-wrap">
				<h3 class="font-semibold text-gray-900 truncate">{title}</h3>
				{#if hold.missingPrice}
					<span class="badge-warning">Missing price</span>
				{/if}
			</div>
			<div class="text-sm text-gray-500 truncate">{HOLD_REASON_LABELS[hold.reason] ?? hold.reason}</div>
			{#if hold.itemDescription}
				<div class="text-sm text-gray-600 truncate">{hold.itemDescription}</div>
			{/if}
			<div class="mt-1 flex items-center gap-2 flex-wrap text-xs">
				<span
					class="px-2 py-0.5 rounded-full font-medium
						{urgency === 'normal' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'}"
				>
					{formatRelativeTime(hold.createdAt)}
				</span>
				{#if hold.reason === 'customer_pickup' && hold.pickupDate}
					<span class="text-gray-500">Pickup {formatDate(hold.pickupDate)}</span>
				{/if}
				{#if hold.createdByName && !compact}
					<span class="text-gray-400">by {hold.createdByName}</span>
				{/if}
			</div>
		</div>

		{#if showClear}
			<button type="button" class="btn-secondary btn-sm flex-shrink-0" on:click={() => dispatch('clear', { id: hold.id })}>
				Clear
			</button>
		{/if}
	</div>
</div>
