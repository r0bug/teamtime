<!--
  EmptyState.svelte - Consistent empty/zero-data placeholder for lists and panels.
  Use this instead of ad-hoc centered "No items yet" blocks.

  Props:
  - title: the headline (e.g. "No tasks yet")
  - message: optional supporting line

  Slots:
  - "icon": replace the default icon
  - default: action buttons (e.g. a "Create" CTA), shown centered below the text

  Example:
    <EmptyState title="No tasks yet" message="Create one to get started.">
      <a href="/tasks/new" class="btn-primary btn-sm">New task</a>
    </EmptyState>
-->
<script lang="ts">
	export let title: string;
	export let message: string | undefined = undefined;
</script>

<div class="text-center py-12 px-4">
	<div class="text-gray-400">
		<slot name="icon">
			<svg
				class="mx-auto h-12 w-12"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
				/>
			</svg>
		</slot>
	</div>
	<h3 class="mt-3 text-lg font-medium text-gray-900">{title}</h3>
	{#if message}
		<p class="mt-1 text-sm text-gray-500">{message}</p>
	{/if}
	{#if $$slots.default}
		<div class="mt-4 flex flex-wrap justify-center gap-2">
			<slot />
		</div>
	{/if}
</div>
