<script lang="ts">
	import { toasts, type Toast } from '$lib/stores/toast';
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';

	// Icon paths by type
	const icons: Record<string, string> = {
		success:
			'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
		error:
			'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
		warning:
			'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
		info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	};

	// Background colors by type
	const bgColors: Record<string, string> = {
		success: 'bg-green-50 border-green-200',
		error: 'bg-red-50 border-red-200',
		warning: 'bg-amber-50 border-amber-200',
		info: 'bg-blue-50 border-blue-200'
	};

	// Icon colors by type
	const iconColors: Record<string, string> = {
		success: 'text-green-500',
		error: 'text-red-500',
		warning: 'text-amber-500',
		info: 'text-blue-500'
	};

	// Text colors by type
	const textColors: Record<string, string> = {
		success: 'text-green-800',
		error: 'text-red-800',
		warning: 'text-amber-800',
		info: 'text-blue-800'
	};

	function handleDismiss(id: string): void {
		toasts.dismiss(id);
	}
</script>

<div
	class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
	aria-live="polite"
	aria-atomic="true"
>
	{#each $toasts as toast (toast.id)}
		<div
			animate:flip={{ duration: 200 }}
			in:fly={{ x: 100, duration: 200 }}
			out:fade={{ duration: 150 }}
			class="pointer-events-auto max-w-sm w-full {bgColors[toast.type]} border rounded-lg shadow-lg overflow-hidden"
			role="alert"
		>
			<div class="p-4">
				<div class="flex items-start gap-3">
					<!-- Icon -->
					<div class="flex-shrink-0">
						<svg
							class="w-5 h-5 {iconColors[toast.type]}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d={icons[toast.type]}
							/>
						</svg>
					</div>

					<!-- Content -->
					<div class="flex-1 min-w-0">
						{#if toast.title}
							<p class="text-sm font-medium {textColors[toast.type]}">
								{toast.title}
							</p>
						{/if}
						<p class="text-sm {toast.title ? 'mt-1' : ''} {textColors[toast.type]}">
							{toast.message}
						</p>
					</div>

					<!-- Dismiss button -->
					{#if toast.dismissible}
						<div class="flex-shrink-0">
							<button
								type="button"
								on:click={() => handleDismiss(toast.id)}
								class="inline-flex rounded-md p-1.5 {textColors[toast.type]} hover:bg-white/50 focus:outline-none focus:ring-2 focus:ring-offset-2"
								aria-label="Dismiss"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
				</div>
			</div>

			<!-- Progress bar for auto-dismiss -->
			{#if toast.duration > 0}
				<div
					class="h-1 {iconColors[toast.type].replace('text-', 'bg-')} opacity-30"
					style="animation: shrink {toast.duration}ms linear forwards"
				/>
			{/if}
		</div>
	{/each}
</div>

<style>
	@keyframes shrink {
		from {
			width: 100%;
		}
		to {
			width: 0%;
		}
	}
</style>
