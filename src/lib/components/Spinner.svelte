<!--
  Spinner.svelte - Consistent inline loading spinner. Inherits the current text
  color (use a text-* class on a wrapper to tint it).

  Props:
  - size: 'sm' | 'md' | 'lg'
  - label: accessible label (sr-only)

  Example: <span class="text-primary-600"><Spinner /></span>
-->
<script lang="ts">
	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let label = 'Loading';

	const sizes: Record<string, string> = {
		sm: 'h-4 w-4',
		md: 'h-6 w-6',
		lg: 'h-10 w-10'
	};
</script>

<span role="status" class="inline-flex items-center">
	<svg class="animate-spin {sizes[size]}" fill="none" viewBox="0 0 24 24" aria-hidden="true">
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
		<path
			class="opacity-75"
			fill="currentColor"
			d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
		/>
	</svg>
	<span class="sr-only">{label}</span>
</span>
