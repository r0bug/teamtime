<!--
  InstallPrompt.svelte - PWA Install Prompt Component

  This component displays a mobile-only prompt encouraging users to install
  TeamTime as a Progressive Web App. It handles different behaviors for:
  - Android/Chrome: Intercepts beforeinstallprompt event for native install
  - iOS Safari: Shows manual instructions (tap Share → Add to Home Screen)

  The prompt respects user preferences and won't show if:
  - The user is on desktop (not mobile)
  - The app is already installed (standalone mode)
  - The user has previously dismissed the prompt (stored in localStorage)

  localStorage key: 'pwa-install-dismissed' - stores 'true' if user dismissed
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	// PWA install prompt state
	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferredPrompt: BeforeInstallPromptEvent | null = null;
	let showInstallPrompt = false;
	let isIOS = false;
	let isStandalone = false;

	// localStorage key for tracking dismissal preference
	// Namespaced with 'pwa-' prefix for clarity
	const DISMISS_STORAGE_KEY = 'pwa-install-dismissed';

	onMount(() => {
		if (browser) {
			// Check if already installed (standalone mode)
			// This detects both Android PWA mode and iOS "Add to Home Screen"
			const nav = window.navigator as Navigator & { standalone?: boolean };
			isStandalone =
				window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;

			// Check if iOS (for showing manual instructions)
			isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

			// Check if mobile device
			const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

			// Don't show on desktop or if already installed
			if (!isMobile || isStandalone) {
				return;
			}

			// Listen for PWA install prompt (Android/Chrome)
			// The beforeinstallprompt event fires when the browser determines
			// the app meets PWA installability criteria
			window.addEventListener('beforeinstallprompt', (e: Event) => {
				// Prevent the mini-infobar from appearing on mobile
				e.preventDefault();
				// Stash the event so it can be triggered later
				deferredPrompt = e as BeforeInstallPromptEvent;
				// Show our custom install prompt
				showInstallPrompt = true;
			});

			// For iOS Safari, show instructions prompt if not dismissed
			// iOS doesn't support beforeinstallprompt, so we show instructions instead
			if (isIOS) {
				const dismissed = localStorage.getItem(DISMISS_STORAGE_KEY);
				if (!dismissed) {
					showInstallPrompt = true;
				}
			}
		}
	});

	/**
	 * Triggers the native PWA install prompt (Android/Chrome only)
	 * After user makes a choice, hides our custom prompt
	 */
	async function installPWA() {
		if (deferredPrompt) {
			// Show the native install prompt
			deferredPrompt.prompt();
			// Wait for user to respond to the prompt
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') {
				showInstallPrompt = false;
			}
			// Clear the deferred prompt - it can only be used once
			deferredPrompt = null;
		}
	}

	/**
	 * Dismisses the install prompt and saves preference to localStorage
	 * The prompt will not appear again on this device/browser
	 */
	function dismissInstallPrompt() {
		showInstallPrompt = false;
		if (browser) {
			localStorage.setItem(DISMISS_STORAGE_KEY, 'true');
		}
	}
</script>

<!-- PWA Install Prompt Banner
     Positioned above bottom navigation (bottom-20 = 5rem above bottom)
     Only visible on mobile devices when showInstallPrompt is true
     Uses z-50 to appear above other content but below modals -->
{#if showInstallPrompt}
	<div class="lg:hidden fixed bottom-20 left-4 right-4 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 safe-bottom">
		<div class="flex items-start gap-3">
			<!-- App icon -->
			<div class="flex-shrink-0 w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
				<svg class="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
				</svg>
			</div>

			<!-- Text content -->
			<div class="flex-1 min-w-0">
				<h3 class="text-sm font-semibold text-gray-900">Install TeamTime</h3>
				{#if isIOS}
					<!-- iOS-specific instructions with share icon -->
					<p class="text-xs text-gray-500 mt-0.5">
						Tap <span class="inline-flex items-center"><svg class="w-4 h-4 mx-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L12 14M12 2L8 6M12 2L16 6M4 14V20H20V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span> then "Add to Home Screen"
					</p>
				{:else}
					<!-- Android/Chrome one-tap install message -->
					<p class="text-xs text-gray-500 mt-0.5">Add to your home screen for quick access</p>
				{/if}
			</div>

			<!-- Dismiss button -->
			<button
				on:click={dismissInstallPrompt}
				class="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
				aria-label="Dismiss install prompt"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Install button (only shown for Android/Chrome with deferred prompt) -->
		{#if !isIOS && deferredPrompt}
			<button
				on:click={installPWA}
				class="mt-3 w-full py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
			>
				Install App
			</button>
		{/if}
	</div>
{/if}
