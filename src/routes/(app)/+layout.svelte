<script lang="ts">
	import { page } from '$app/stores';
	import type { LayoutData } from './$types';
	import Avatar from '$lib/components/Avatar.svelte';

	export let data: LayoutData;

	$: user = data.user;
	$: isAdmin = user?.role === 'admin';
	$: isManager = user?.role === 'manager' || user?.role === 'admin';
	$: isPurchaser = user?.role === 'purchaser' || isManager;

	$: navItems = [
		{ href: '/dashboard', label: 'Home', icon: 'home', show: true },
		{ href: '/schedule', label: 'Schedule', icon: 'calendar', show: true },
		{ href: '/tasks', label: 'Tasks', icon: 'clipboard', show: true },
		{ href: '/messages', label: 'Messages', icon: 'chat', show: true },
		{ href: '/expenses', label: 'Expenses', icon: 'dollar', show: isPurchaser }
	].filter(item => item.show);

	$: adminItems = [
		{ href: '/admin', label: 'Dashboard', icon: 'dashboard', show: true },
		{ href: '/admin/users', label: 'Users', icon: 'users', show: true },
		{ href: '/admin/messages', label: 'Messages', icon: 'chat', show: true },
		{ href: '/admin/schedule', label: 'Schedule', icon: 'calendar', show: true },
		{ href: '/admin/export-hours', label: 'Export Hours', icon: 'download', show: true },
		{ href: '/admin/locations', label: 'Locations', icon: 'location', show: true },
		{ href: '/admin/audit-logs', label: 'Audit Logs', icon: 'shield', show: isAdmin },
		{ href: '/admin/modules', label: 'Modules', icon: 'puzzle', show: isAdmin }
	].filter(item => item.show);

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
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
							{#if item.icon === 'home'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
							{:else if item.icon === 'calendar'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
							{:else if item.icon === 'clipboard'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
							{:else if item.icon === 'chat'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
							{:else if item.icon === 'dollar'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
							{/if}
						</span>
						{item.label}
					</a>
				{/each}

				{#if isManager}
					<div class="pt-4 mt-4 border-t border-gray-200">
						<p class="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</p>
						{#each adminItems as item}
							<a
								href={item.href}
								class="flex items-center px-3 py-2 mt-1 text-sm font-medium rounded-lg transition-colors {isActive(item.href) ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}"
							>
								<span class="w-5 h-5 mr-3">
									{#if item.icon === 'dashboard'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
									{:else if item.icon === 'users'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
									{:else if item.icon === 'chat'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
									{:else if item.icon === 'calendar'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
									{:else if item.icon === 'download'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
									{:else if item.icon === 'location'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
									{:else if item.icon === 'shield'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
									{:else if item.icon === 'puzzle'}
										<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>
									{/if}
								</span>
								{item.label}
							</a>
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
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
				<h1 class="text-lg font-bold text-primary-600">TeamTime</h1>
				<div class="flex items-center space-x-2">
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

		<!-- Page Content -->
		<main class="pt-14 pb-20 lg:pt-0 lg:pb-0 min-h-screen">
			<slot />
		</main>

		<!-- Mobile Bottom Navigation -->
		<nav class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-bottom">
			<div class="flex items-center justify-around h-16">
				{#each navItems as item}
					<a
						href={item.href}
						class="flex flex-col items-center justify-center flex-1 h-full touch-target {isActive(item.href) ? 'text-primary-600' : 'text-gray-500'}"
					>
						<span class="w-6 h-6">
							{#if item.icon === 'home'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
							{:else if item.icon === 'calendar'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
							{:else if item.icon === 'clipboard'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
							{:else if item.icon === 'chat'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
							{:else if item.icon === 'dollar'}
								<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
							{/if}
						</span>
						<span class="text-xs mt-1">{item.label}</span>
					</a>
				{/each}
			</div>
		</nav>
	</div>
</div>
