<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import type { LayoutData } from './$types';
	import Avatar from '$lib/components/Avatar.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	export let data: LayoutData;

	$: user = data.user;
	$: isAdmin = user?.role === 'admin';
	$: isManager = user?.role === 'manager' || user?.role === 'admin';
	$: isPurchaser = user?.role === 'purchaser' || isManager;
	$: canListOnEbay = data.canListOnEbay || isManager;

	// Mobile menu state
	let mobileMenuOpen = false;

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	// Expanded sections state - load from localStorage
	let expandedSections: Record<string, boolean> = {};

	if (browser) {
		const saved = localStorage.getItem('adminNavExpanded');
		if (saved) {
			try {
				expandedSections = JSON.parse(saved);
			} catch {
				expandedSections = {};
			}
		}
	}

	function toggleSection(sectionId: string) {
		expandedSections = {
			...expandedSections,
			[sectionId]: !expandedSections[sectionId]
		};
		if (browser) {
			localStorage.setItem('adminNavExpanded', JSON.stringify(expandedSections));
		}
	}

	// Check if any item in a section is active
	function sectionHasActiveItem(items: Array<{href: string}>): boolean {
		return items.some(item => isActive(item.href));
	}

	$: navItems = [
		{ href: '/dashboard', label: 'Home', icon: 'home', show: true },
		{ href: '/schedule', label: 'Schedule', icon: 'calendar', show: true },
		{ href: '/tasks', label: 'Tasks', icon: 'clipboard', show: true },
		{ href: '/messages', label: 'Messages', icon: 'chat', show: true },
		{ href: '/sales', label: 'Sales', icon: 'chart', show: true },
		{ href: '/info', label: 'Info', icon: 'info', show: true },
		{ href: '/pricing', label: 'Pricing', icon: 'tag', show: true },
		{ href: '/inventory/drops', label: 'Drops', icon: 'box', show: isPurchaser },
		{ href: '/ebay/tasks', label: 'eBay Tasks', icon: 'globe', show: canListOnEbay },
		{ href: '/expenses', label: 'Expenses', icon: 'dollar', show: isPurchaser },
		{ href: '/admin/office-manager/chat', label: 'Office Manager', icon: 'office-chat', show: isManager }
	].filter(item => item.show);

	// Grouped admin sections
	$: adminSections = [
		{
			id: 'overview',
			label: 'Overview',
			icon: 'dashboard',
			items: [
				{ href: '/admin', label: 'Dashboard', icon: 'dashboard', show: true }
			].filter(item => item.show)
		},
		{
			id: 'users',
			label: 'User Management',
			icon: 'users',
			items: [
				{ href: '/admin/users', label: 'Users', icon: 'users', show: true },
				{ href: '/admin/settings/access-control', label: 'Access Control', icon: 'key', show: isAdmin },
				{ href: '/admin/audit-logs', label: 'Audit Logs', icon: 'shield', show: isAdmin }
			].filter(item => item.show)
		},
		{
			id: 'operations',
			label: 'Operations',
			icon: 'location',
			items: [
				{ href: '/admin/locations', label: 'Locations', icon: 'location', show: true },
				{ href: '/admin/schedule', label: 'Schedule', icon: 'calendar', show: true },
				{ href: '/admin/tasks', label: 'Task Management', icon: 'clipboard-check', show: true },
				{ href: '/admin/cash-counts', label: 'Cash Counts', icon: 'cash', show: true },
				{ href: '/admin/export-hours', label: 'Export Hours', icon: 'download', show: true }
			].filter(item => item.show)
		},
		{
			id: 'ai',
			label: 'AI & Automation',
			icon: 'brain',
			items: [
				{ href: '/admin/ai', label: 'AI Dashboard', icon: 'brain', show: isAdmin },
				{ href: '/admin/ai/actions', label: 'AI Actions', icon: 'activity', show: isAdmin },
				{ href: '/admin/architect', label: 'Ada (Architect)', icon: 'architect', show: isAdmin }
			].filter(item => item.show)
		},
		{
			id: 'reports',
			label: 'Reports & Analytics',
			icon: 'chart',
			items: [
				{ href: '/admin/reports', label: 'Reports', icon: 'chart', show: true },
				{ href: '/admin/pricing', label: 'Pricing Analytics', icon: 'tag', show: true },
				{ href: '/admin/messages', label: 'Communications', icon: 'chat', show: true }
			].filter(item => item.show)
		},
		{
			id: 'settings',
			label: 'System Settings',
			icon: 'cog',
			items: [
				{ href: '/admin/settings', label: 'Settings', icon: 'cog', show: true },
				{ href: '/admin/modules', label: 'Modules', icon: 'puzzle', show: isAdmin },
				{ href: '/admin/pay-periods', label: 'Pay Periods', icon: 'clock', show: true },
				{ href: '/admin/info', label: 'Info Posts', icon: 'document', show: true }
			].filter(item => item.show)
		}
	].filter(section => section.items.length > 0);

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

	// Icon component helper
	function getIcon(iconName: string): string {
		const icons: Record<string, string> = {
			'home': 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
			'calendar': 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
			'clipboard': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
			'clipboard-check': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
			'chat': 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
			'info': 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
			'tag': 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
			'globe': 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
			'dollar': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
			'box': 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
			'dashboard': 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
			'users': 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
			'download': 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
			'location': 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
			'shield': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
			'puzzle': 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z',
			'brain': 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
			'activity': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
			'architect': 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
			'cog': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
			'key': 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
			'chart': 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
			'clock': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
			'document': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
			'office-chat': 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z',
			'cash': 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
			'chevron-down': 'M19 9l-7 7-7-7',
			'chevron-right': 'M9 5l7 7-7 7'
		};
		return icons[iconName] || '';
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Desktop Sidebar -->
	<aside class="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
		<div class="flex flex-col flex-grow bg-white border-r border-gray-200">
			<div class="flex items-center h-16 px-4 border-b border-gray-200">
				<h1 class="text-xl font-bold text-primary-600">TeamTime</h1>
			</div>

			<nav class="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
				{#each navItems as item}
					<a
						href={item.href}
						class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors {isActive(item.href) ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}"
					>
						<span class="w-5 h-5 mr-3">
							<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(item.icon)} />
							</svg>
						</span>
						{item.label}
					</a>
				{/each}

				{#if isManager}
					<div class="pt-4 mt-4 border-t border-gray-200">
						<p class="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin</p>

						{#each adminSections as section}
							{@const hasActive = sectionHasActiveItem(section.items)}
							{@const isExpanded = expandedSections[section.id] !== false && (expandedSections[section.id] || hasActive)}

							{#if section.items.length === 1}
								<!-- Single item section - just show the item -->
								<a
									href={section.items[0].href}
									class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors {isActive(section.items[0].href) ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}"
								>
									<span class="w-5 h-5 mr-3">
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(section.items[0].icon)} />
										</svg>
									</span>
									{section.items[0].label}
								</a>
							{:else}
								<!-- Multi-item section - collapsible -->
								<div class="mb-1">
									<button
										on:click={() => toggleSection(section.id)}
										class="flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors {hasActive ? 'text-primary-700 bg-primary-50/50' : 'text-gray-700 hover:bg-gray-100'}"
									>
										<span class="flex items-center">
											<span class="w-5 h-5 mr-3">
												<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(section.icon)} />
												</svg>
											</span>
											{section.label}
										</span>
										<svg
											class="w-4 h-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('chevron-down')} />
										</svg>
									</button>

									{#if isExpanded}
										<div class="mt-1 ml-4 space-y-1 border-l-2 border-gray-100 pl-2">
											{#each section.items as item}
												<a
													href={item.href}
													class="flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors {isActive(item.href) ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
												>
													<span class="w-4 h-4 mr-2">
														<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(item.icon)} />
														</svg>
													</span>
													{item.label}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</nav>

			<div class="flex-shrink-0 p-4 border-t border-gray-200">
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<Avatar src={user?.avatarUrl} name={user?.name || ''} size="md" />
					</div>
					<div class="ml-3 flex-1">
						<p class="text-sm font-medium text-gray-900">{user?.name}</p>
						<p class="text-xs text-gray-500 capitalize">{user?.role}</p>
					</div>
					<a href="/settings" class="p-2 text-gray-400 hover:text-gray-600">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('cog')} />
						</svg>
					</a>
				</div>
			</div>
		</div>
	</aside>

	<!-- Main Content -->
	<div class="lg:pl-64">
		<!-- Mobile Header -->
		<header class="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 safe-top">
			<div class="flex items-center justify-between h-14 px-4">
				<button
					on:click={() => mobileMenuOpen = true}
					class="p-2 -ml-2 text-gray-600 hover:text-gray-900"
					aria-label="Open menu"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
					</svg>
				</button>
				<h1 class="text-lg font-bold text-primary-600">TeamTime</h1>
				<div class="flex items-center space-x-1">
					<a href="/notifications" class="p-2 text-gray-600 hover:text-gray-900 relative">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
						</svg>
					</a>
					<a href="/settings" class="p-2 text-gray-600 hover:text-gray-900">
						<Avatar src={user?.avatarUrl} name={user?.name || ''} size="sm" />
					</a>
				</div>
			</div>
		</header>

		<!-- Mobile Slide-out Menu -->
		{#if mobileMenuOpen}
			<div class="lg:hidden fixed inset-0 z-50">
				<!-- Backdrop -->
				<div
					class="fixed inset-0 bg-black bg-opacity-50"
					on:click={closeMobileMenu}
					on:keypress={(e) => e.key === 'Escape' && closeMobileMenu()}
					role="button"
					tabindex="0"
					aria-label="Close menu"
				></div>

				<!-- Menu Panel -->
				<div class="fixed inset-y-0 left-0 w-72 bg-white shadow-xl safe-top safe-bottom overflow-y-auto">
					<div class="flex items-center justify-between h-14 px-4 border-b border-gray-200">
						<h2 class="text-lg font-bold text-primary-600">Menu</h2>
						<button
							on:click={closeMobileMenu}
							class="p-2 text-gray-600 hover:text-gray-900"
							aria-label="Close menu"
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- User Info -->
					<div class="p-4 border-b border-gray-200 bg-gray-50">
						<div class="flex items-center">
							<Avatar src={user?.avatarUrl} name={user?.name || ''} size="md" />
							<div class="ml-3">
								<p class="text-sm font-medium text-gray-900">{user?.name}</p>
								<p class="text-xs text-gray-500 capitalize">{user?.role}</p>
							</div>
						</div>
					</div>

					<!-- Navigation -->
					<nav class="p-2">
						<p class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Main</p>
						{#each navItems as item}
							<a
								href={item.href}
								on:click={closeMobileMenu}
								class="flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors {isActive(item.href) ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}"
							>
								<span class="w-5 h-5 mr-3">
									<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(item.icon)} />
									</svg>
								</span>
								{item.label}
							</a>
						{/each}

						{#if isManager}
							<div class="pt-4 mt-4 border-t border-gray-200">
								<p class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</p>

								{#each adminSections as section}
									{@const hasActive = sectionHasActiveItem(section.items)}
									{@const isExpanded = expandedSections[section.id] !== false && (expandedSections[section.id] || hasActive)}

									{#if section.items.length === 1}
										<a
											href={section.items[0].href}
											on:click={closeMobileMenu}
											class="flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors {isActive(section.items[0].href) ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}"
										>
											<span class="w-5 h-5 mr-3">
												<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(section.items[0].icon)} />
												</svg>
											</span>
											{section.items[0].label}
										</a>
									{:else}
										<div class="mb-1">
											<button
												on:click={() => toggleSection(section.id)}
												class="flex items-center justify-between w-full px-3 py-3 text-sm font-medium rounded-lg transition-colors {hasActive ? 'text-primary-700 bg-primary-50/50' : 'text-gray-700 hover:bg-gray-100'}"
											>
												<span class="flex items-center">
													<span class="w-5 h-5 mr-3">
														<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(section.icon)} />
														</svg>
													</span>
													{section.label}
												</span>
												<svg
													class="w-4 h-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('chevron-down')} />
												</svg>
											</button>

											{#if isExpanded}
												<div class="mt-1 ml-4 space-y-1 border-l-2 border-gray-100 pl-2">
													{#each section.items as item}
														<a
															href={item.href}
															on:click={closeMobileMenu}
															class="flex items-center px-3 py-2 text-sm rounded-lg transition-colors {isActive(item.href) ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
														>
															<span class="w-4 h-4 mr-2">
																<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(item.icon)} />
																</svg>
															</span>
															{item.label}
														</a>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						{/if}

						<!-- Settings & Logout -->
						<div class="pt-4 mt-4 border-t border-gray-200">
							<a
								href="/settings"
								on:click={closeMobileMenu}
								class="flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors {isActive('/settings') ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}"
							>
								<span class="w-5 h-5 mr-3">
									<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('cog')} />
									</svg>
								</span>
								Settings
							</a>
							<a
								href="/logout"
								class="flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors text-red-600 hover:bg-red-50"
							>
								<span class="w-5 h-5 mr-3">
									<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
									</svg>
								</span>
								Logout
							</a>
						</div>
					</nav>
				</div>
			</div>
		{/if}

		<!-- Page Content -->
		<main class="pt-14 pb-20 lg:pt-0 lg:pb-0 min-h-screen">
			<slot />
		</main>

		<!-- Mobile Bottom Navigation -->
		<nav class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-bottom">
			<div class="flex items-center justify-around h-16">
				{#each navItems.slice(0, 5) as item}
					<a
						href={item.href}
						class="flex flex-col items-center justify-center flex-1 h-full touch-target {isActive(item.href) ? 'text-primary-600' : 'text-gray-500'}"
					>
						<span class="w-6 h-6">
							<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(item.icon)} />
							</svg>
						</span>
						<span class="text-xs mt-1">{item.label}</span>
					</a>
				{/each}
			</div>
		</nav>
	</div>
</div>

<!-- PWA Install Prompt Component - displays above bottom nav on mobile -->
<InstallPrompt />
