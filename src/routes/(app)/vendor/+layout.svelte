<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { browser } from '$app/environment';

	export let data: LayoutData;

	// Single source of truth for the vendor portal navigation.
	const navItems = [
		{ href: '/vendor', label: 'Home', exact: true },
		{ href: '/vendor/news', label: 'News' },
		{ href: '/vendor/inventory', label: 'Inventory' },
		{ href: '/vendor/notes', label: 'Notes' },
		// Web Avery "Print Sheet" unlinked — vendors print via the desktop app
		// (USB/print-queue). Route + renderer kept intact for re-linking later.
		// { href: '/vendor/print', label: 'Print Sheet' },
		{ href: '/vendor/app', label: 'Get the App' },
		{ href: '/vendor/leaderboard', label: 'Leaderboard' },
		{ href: '/vendor/sales', label: 'Sales' },
		{ href: '/vendor/profile', label: 'Profile' }
	];

	function isActive(href: string, exact: boolean): boolean {
		const path = $page.url.pathname;
		return exact ? path === href : path === href || path.startsWith(href + '/');
	}

	// Pinned announcements show as a banner on every portal page until this
	// vendor dismisses that revision (dismissal is per-browser; an edited
	// announcement — newer updatedAt — comes back).
	const DISMISS_KEY = 'ttportal.dismissedNews';
	let dismissed: Record<string, string> = {};
	if (browser) {
		try {
			dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
		} catch {
			dismissed = {};
		}
	}
	$: visiblePinned = (data.pinnedAnnouncements ?? []).filter(
		(a) => dismissed[a.id] !== new Date(a.updatedAt).toISOString()
	);
	function dismissPinned(a: { id: string; updatedAt: string | Date }) {
		dismissed = { ...dismissed, [a.id]: new Date(a.updatedAt).toISOString() };
		try {
			localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
		} catch {
			/* private mode — banner just reappears next visit */
		}
	}
</script>

<div class="min-h-screen bg-gray-50">
	<header class="bg-white border-b border-gray-200">
		<div class="max-w-5xl mx-auto px-4 lg:px-8 flex items-center justify-between h-14">
			<div class="flex items-center gap-3">
				<span class="font-bold text-gray-900">{data.vendor.displayName}</span>
				{#if data.vendor.inventoryCodePrefix}
					<span class="text-xs px-2 py-0.5 rounded font-mono bg-amber-100 text-amber-800">{data.vendor.inventoryCodePrefix}</span>
				{/if}
			</div>
			<form method="POST" action="/logout" use:enhance>
				<button type="submit" class="text-sm text-gray-600 hover:text-gray-900">Sign out</button>
			</form>
		</div>
		<nav class="max-w-5xl mx-auto px-4 lg:px-8 flex gap-1 -mb-px overflow-x-auto">
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="px-3 py-2 text-sm border-b-2 whitespace-nowrap {isActive(item.href, item.exact ?? false) ? 'border-primary-600 text-primary-600 font-semibold' : 'border-transparent text-gray-600 hover:text-gray-900'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>
	</header>

	{#if visiblePinned.length}
		<div class="bg-amber-50 border-b border-amber-200">
			<div class="max-w-5xl mx-auto px-4 lg:px-8 py-2 flex flex-col gap-1">
				{#each visiblePinned as a (a.id)}
					<div class="flex items-center gap-2 text-sm text-amber-900">
						<span aria-hidden="true">📣</span>
						<a href="/vendor/news" class="min-w-0 truncate font-medium hover:underline">{a.title}</a>
						<span class="flex-1"></span>
						<button
							class="text-amber-700 hover:text-amber-900 text-lg leading-none px-1 touch-target"
							title="Dismiss"
							aria-label="Dismiss announcement"
							on:click={() => dismissPinned(a)}
						>×</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<main>
		<slot />
	</main>
</div>
