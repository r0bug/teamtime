<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let threshold = 80; // px to trigger action
	export let leftLabel = 'Dismiss';
	export let rightLabel = 'Complete';
	export let leftColor = 'bg-red-500';
	export let rightColor = 'bg-green-500';

	const dispatch = createEventDispatcher<{ swipeLeft: void; swipeRight: void }>();

	let startX = 0;
	let currentX = 0;
	let swiping = false;
	let el: HTMLDivElement;

	function handleTouchStart(e: TouchEvent) {
		startX = e.touches[0].clientX;
		currentX = 0;
		swiping = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!swiping) return;
		currentX = e.touches[0].clientX - startX;
	}

	function handleTouchEnd() {
		if (!swiping) return;
		swiping = false;

		if (currentX > threshold) {
			dispatch('swipeRight');
		} else if (currentX < -threshold) {
			dispatch('swipeLeft');
		}
		currentX = 0;
	}

	$: offset = swiping ? currentX : 0;
	$: opacity = Math.min(Math.abs(offset) / threshold, 1);
	$: showRight = offset > 20;
	$: showLeft = offset < -20;
</script>

<div class="relative overflow-hidden rounded-lg">
	<!-- Background action indicators -->
	{#if showRight}
		<div class="absolute inset-y-0 left-0 flex items-center px-4 {rightColor} text-white font-medium" style="opacity: {opacity}">
			{rightLabel}
		</div>
	{/if}
	{#if showLeft}
		<div class="absolute inset-y-0 right-0 flex items-center px-4 {leftColor} text-white font-medium" style="opacity: {opacity}">
			{leftLabel}
		</div>
	{/if}

	<!-- Card content -->
	<div
		bind:this={el}
		on:touchstart={handleTouchStart}
		on:touchmove={handleTouchMove}
		on:touchend={handleTouchEnd}
		class="relative bg-white transition-transform {swiping ? '' : 'duration-200'}"
		style="transform: translateX({offset}px)"
		role="listitem"
	>
		<slot />
	</div>
</div>
