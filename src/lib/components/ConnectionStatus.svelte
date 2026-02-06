<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let isOnline = true;
	let showReconnected = false;
	let reconnectTimer: ReturnType<typeof setTimeout>;
	let healthCheckInterval: ReturnType<typeof setInterval>;

	function handleOnline() {
		isOnline = true;
		showReconnected = true;
		reconnectTimer = setTimeout(() => {
			showReconnected = false;
		}, 3000);
	}

	function handleOffline() {
		isOnline = false;
		showReconnected = false;
	}

	async function checkHealth() {
		if (!browser) return;
		try {
			const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
			if (!res.ok && isOnline) handleOffline();
			else if (res.ok && !isOnline) handleOnline();
		} catch {
			if (isOnline && !navigator.onLine) handleOffline();
		}
	}

	onMount(() => {
		if (!browser) return;
		isOnline = navigator.onLine;
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		// Periodic health check every 30s
		healthCheckInterval = setInterval(checkHealth, 30000);
	});

	onDestroy(() => {
		if (!browser) return;
		window.removeEventListener('online', handleOnline);
		window.removeEventListener('offline', handleOffline);
		clearTimeout(reconnectTimer);
		clearInterval(healthCheckInterval);
	});
</script>

{#if !isOnline}
	<div class="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-900 text-center py-2 px-4 text-sm font-medium shadow-lg">
		You're offline — changes will sync when connected
	</div>
{/if}

{#if showReconnected}
	<div class="fixed top-0 left-0 right-0 z-50 bg-green-500 text-white text-center py-2 px-4 text-sm font-medium shadow-lg transition-opacity duration-500">
		Back online — syncing...
	</div>
{/if}
