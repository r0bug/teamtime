<!--
  ShoutoutButton.svelte - Compact Shoutout Trigger Button

  A small button that can be placed next to users, tasks, etc.
  Opens the ShoutoutModal when clicked.

  Props:
  - recipientId: UUID of the person to give shoutout to
  - recipientName: Display name for the modal
  - sourceType: Where this shoutout originated ('task', 'pricing', 'message', 'manual')
  - sourceId: ID of the source entity
  - size: 'sm' | 'md' | 'lg' - button size
  - variant: 'icon' | 'text' | 'full' - display style
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import ShoutoutModal from './ShoutoutModal.svelte';

	export let recipientId: string;
	export let recipientName: string;
	export let sourceType: 'task' | 'pricing' | 'message' | 'manual' = 'manual';
	export let sourceId: string | undefined = undefined;
	export let size: 'sm' | 'md' | 'lg' = 'sm';
	export let variant: 'icon' | 'text' | 'full' = 'icon';
	export let disabled = false;

	const dispatch = createEventDispatcher<{
		shoutoutCreated: { shoutoutId: string };
	}>();

	let showModal = false;

	const sizeClasses = {
		sm: 'p-1 text-xs',
		md: 'p-1.5 text-sm',
		lg: 'p-2 text-base'
	};

	const iconSizes = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6'
	};

	function handleShoutoutCreated(event: CustomEvent<{ shoutoutId: string }>) {
		showModal = false;
		dispatch('shoutoutCreated', event.detail);
	}
</script>

{#if variant === 'icon'}
	<button
		type="button"
		on:click={() => showModal = true}
		{disabled}
		class="{sizeClasses[size]} rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-50
			transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		title="Give shoutout to {recipientName}"
		aria-label="Give shoutout"
	>
		<svg class={iconSizes[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
				d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
		</svg>
	</button>
{:else if variant === 'text'}
	<button
		type="button"
		on:click={() => showModal = true}
		{disabled}
		class="{sizeClasses[size]} px-2 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50
			transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
	>
		<svg class={iconSizes[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
				d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
		</svg>
		Shoutout
	</button>
{:else}
	<button
		type="button"
		on:click={() => showModal = true}
		{disabled}
		class="{sizeClasses[size]} px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100
			border border-amber-200 transition-colors font-medium disabled:opacity-50
			disabled:cursor-not-allowed flex items-center gap-2"
	>
		<svg class={iconSizes[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
				d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
		</svg>
		Give Shoutout
	</button>
{/if}

{#if showModal}
	<ShoutoutModal
		{recipientId}
		{recipientName}
		{sourceType}
		{sourceId}
		on:close={() => showModal = false}
		on:created={handleShoutoutCreated}
	/>
{/if}
