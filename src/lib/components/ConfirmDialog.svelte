<!--
  ConfirmDialog.svelte - Standard confirmation prompt for destructive/irreversible
  actions. Use this instead of native confirm() or bespoke confirm modals.

  Props:
  - open: visibility (parent-owned)
  - title / message: prompt text
  - confirmLabel / cancelLabel: button text
  - variant: 'danger' (default) | 'primary' for the confirm button
  - loading: disables buttons and shows a working state while the action runs

  Events:
  - confirm: user confirmed
  - cancel: user dismissed (Cancel, Esc, backdrop)

  Example:
    <ConfirmDialog open={confirming} title="Delete shift?"
      message="This cannot be undone." confirmLabel="Delete"
      on:confirm={doDelete} on:cancel={() => (confirming = false)} />
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from './Modal.svelte';

	export let open = false;
	export let title = 'Are you sure?';
	export let message = '';
	export let confirmLabel = 'Confirm';
	export let cancelLabel = 'Cancel';
	export let variant: 'danger' | 'primary' = 'danger';
	export let loading = false;

	const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();
</script>

<Modal {open} {title} size="sm" closeOnBackdrop={!loading} closeOnEsc={!loading} on:close={() => dispatch('cancel')}>
	{#if message}
		<p class="text-sm text-gray-600">{message}</p>
	{/if}
	<slot />

	<svelte:fragment slot="footer">
		<button type="button" class="btn-secondary" on:click={() => dispatch('cancel')} disabled={loading}>
			{cancelLabel}
		</button>
		<button
			type="button"
			class={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
			on:click={() => dispatch('confirm')}
			disabled={loading}
		>
			{loading ? 'Working…' : confirmLabel}
		</button>
	</svelte:fragment>
</Modal>
