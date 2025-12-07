<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;

	$: notifications = data.notifications;
	$: unreadCount = notifications.filter(n => !n.isRead).length;

	function formatDate(date: string | Date) {
		const d = new Date(date);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function getNotificationIcon(type: string) {
		switch (type) {
			case 'task_assigned':
			case 'task_due':
			case 'task_overdue':
				return 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4';
			case 'schedule_change':
			case 'shift_request':
			case 'shift_reminder':
				return 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z';
			case 'new_message':
				return 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z';
			case 'purchase_decision':
				return 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
			default:
				return 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9';
		}
	}
</script>

<svelte:head>
	<title>Notifications - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold">Notifications</h1>
				{#if unreadCount > 0}
					<p class="text-sm text-gray-500">{unreadCount} unread</p>
				{/if}
			</div>
			{#if unreadCount > 0}
				<form method="POST" action="?/markAllRead" use:enhance>
					<button type="submit" class="text-primary-600 hover:text-primary-700 text-sm font-medium">
						Mark all as read
					</button>
				</form>
			{/if}
		</div>

		{#if notifications.length > 0}
			<div class="space-y-2">
				{#each notifications as notification}
					<div class="card {notification.isRead ? 'bg-white' : 'bg-blue-50 border-blue-200'}">
						<div class="card-body p-4">
							<div class="flex gap-3">
								<div class="flex-shrink-0">
									<div class="{notification.isRead ? 'bg-gray-100' : 'bg-primary-100'} w-10 h-10 rounded-full flex items-center justify-center">
										<svg class="w-5 h-5 {notification.isRead ? 'text-gray-600' : 'text-primary-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getNotificationIcon(notification.type)} />
										</svg>
									</div>
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-start justify-between gap-2">
										<div>
											<p class="font-medium {notification.isRead ? 'text-gray-900' : 'text-gray-900'}">{notification.title}</p>
											{#if notification.body}
												<p class="text-sm text-gray-600 mt-1">{notification.body}</p>
											{/if}
											<p class="text-xs text-gray-500 mt-1">{formatDate(notification.createdAt)}</p>
										</div>
										<div class="flex items-center gap-2">
											{#if !notification.isRead}
												<form method="POST" action="?/markRead" use:enhance>
													<input type="hidden" name="notificationId" value={notification.id} />
													<button type="submit" class="text-gray-400 hover:text-gray-600 p-1" title="Mark as read">
														<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
														</svg>
													</button>
												</form>
											{/if}
											<form method="POST" action="?/delete" use:enhance>
												<input type="hidden" name="notificationId" value={notification.id} />
												<button type="submit" class="text-gray-400 hover:text-red-600 p-1" title="Delete">
													<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
													</svg>
												</button>
											</form>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="card">
				<div class="card-body text-center py-12">
					<svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
					</svg>
					<p class="text-gray-500">No notifications</p>
					<p class="text-sm text-gray-400 mt-1">You're all caught up!</p>
				</div>
			</div>
		{/if}
	</div>
</div>
