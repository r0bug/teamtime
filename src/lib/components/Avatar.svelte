<script lang="ts">
	export let src: string | null = null;
	export let name: string = '';
	export let size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';

	const sizeClasses = {
		xs: 'w-6 h-6 text-xs',
		sm: 'w-8 h-8 text-sm',
		md: 'w-10 h-10 text-base',
		lg: 'w-12 h-12 text-lg',
		xl: 'w-16 h-16 text-2xl'
	};

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map(n => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

<div class="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 {sizeClasses[size]}">
	{#if src}
		<img {src} alt={name} class="w-full h-full object-cover" />
	{:else}
		<div class="w-full h-full bg-primary-600 flex items-center justify-center text-white font-medium">
			{getInitials(name || '?')}
		</div>
	{/if}
</div>
