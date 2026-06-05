<!--
  Modal.svelte - Shared accessible modal/overlay primitive.

  Use this instead of hand-rolling `fixed inset-0` backdrops. Handles backdrop,
  Escape-to-close, click-outside, focus trap, focus restore, and body scroll lock.

  Props:
  - open: controls visibility (two-way not needed; parent owns state)
  - title: optional title rendered in the header (sets the dialog's accessible name)
  - size: 'sm' | 'md' | 'lg' | 'xl'
  - closeOnBackdrop / closeOnEsc: opt out of dismiss behaviors

  Events:
  - close: user requested to close (Esc, backdrop, or X). Parent sets `open = false`.

  Slots: default (body), "header" (replaces title), "footer" (action buttons).
-->
<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	export let open = false;
	export let title: string | undefined = undefined;
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
	export let closeOnBackdrop = true;
	export let closeOnEsc = true;

	const dispatch = createEventDispatcher<{ close: void }>();

	const sizes: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-2xl'
	};

	const FOCUSABLE =
		'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	let panel: HTMLDivElement | null = null;
	let previouslyFocused: HTMLElement | null = null;
	let wasOpen = false;

	function close() {
		dispatch('close');
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape' && closeOnEsc) {
			e.stopPropagation();
			close();
			return;
		}
		if (e.key === 'Tab' && panel) {
			const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
			if (focusable.length === 0) {
				e.preventDefault();
				panel.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	// React only on the open <-> closed transition (not on every reactive tick).
	$: if (open !== wasOpen && typeof document !== 'undefined') {
		wasOpen = open;
		if (open) {
			document.body.style.overflow = 'hidden';
			previouslyFocused = document.activeElement as HTMLElement;
			queueMicrotask(() => {
				const target = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
				target?.focus();
			});
		} else {
			document.body.style.overflow = '';
			previouslyFocused?.focus?.();
			previouslyFocused = null;
		}
	}

	onDestroy(() => {
		if (typeof document !== 'undefined') document.body.style.overflow = '';
	});
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/50"
			transition:fade={{ duration: 150 }}
			on:click={() => closeOnBackdrop && close()}
			aria-hidden="true"
		/>

		<div
			bind:this={panel}
			class="card relative w-full {sizes[size]} max-h-[90vh] overflow-y-auto focus:outline-none"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			transition:scale={{ duration: 150, start: 0.96 }}
		>
			{#if title || $$slots.header}
				<div class="card-header flex items-center justify-between gap-3">
					<slot name="header">
						<h2 class="text-lg font-semibold text-gray-900">{title}</h2>
					</slot>
					<button type="button" class="btn-ghost btn-sm -mr-2" on:click={close} aria-label="Close">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>
			{/if}

			<div class="card-body">
				<slot />
			</div>

			{#if $$slots.footer}
				<div class="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
					<slot name="footer" />
				</div>
			{/if}
		</div>
	</div>
{/if}
