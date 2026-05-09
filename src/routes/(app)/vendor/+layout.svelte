<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/stores';

	export let data: LayoutData;

	const navItems = [
		{ href: '/vendor', label: 'Home', exact: true },
		{ href: '/vendor/inventory', label: 'Inventory' },
		{ href: '/vendor/print', label: 'Print Sheet' },
		{ href: '/vendor/leaderboard', label: 'Leaderboard' },
		{ href: '/vendor/sales', label: 'Sales' },
		{ href: '/vendor/profile', label: 'Profile' }
	];

	function isActive(href: string, exact: boolean): boolean {
		const path = $page.url.pathname;
		return exact ? path === href : path === href || path.startsWith(href + '/');
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
			<a href="/logout" class="text-sm text-gray-600 hover:text-gray-900">Sign out</a>
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

	<main>
		<slot />
	</main>
</div>
