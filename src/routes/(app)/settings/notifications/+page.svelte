<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: subscriptions = data.subscriptions;

	let loading = false;

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Notification Settings - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/settings" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">Notification Settings</h1>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				Device removed successfully
			</div>
		{/if}

		<!-- Push Notification Info -->
		<div class="card mb-6">
			<div class="card-body">
				<h2 class="text-lg font-semibold mb-4">Push Notifications</h2>
				<p class="text-gray-600 mb-4">
					Push notifications allow you to receive updates about shifts, tasks, and messages even when you're not actively using the app.
				</p>
				<div class="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
					<strong>Note:</strong> Push notifications are sent for:
					<ul class="list-disc list-inside mt-2 space-y-1">
						<li>New task assignments</li>
						<li>Schedule changes</li>
						<li>New messages</li>
						<li>Purchase request decisions</li>
						<li>Shift reminders</li>
					</ul>
				</div>
			</div>
		</div>

		<!-- Subscribed Devices -->
		<div class="card">
			<div class="card-body">
				<h2 class="text-lg font-semibold mb-4">Subscribed Devices</h2>

				{#if subscriptions.length > 0}
					<div class="space-y-3">
						{#each subscriptions as subscription}
							<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
								<div>
									<div class="font-medium">
										{subscription.deviceInfo || 'Unknown Device'}
									</div>
									<div class="text-sm text-gray-500">
										Added on {formatDate(subscription.createdAt)}
									</div>
								</div>
								<form method="POST" action="?/unsubscribe" use:enhance>
									<input type="hidden" name="subscriptionId" value={subscription.id} />
									<button
										type="submit"
										class="text-red-600 hover:text-red-700 text-sm"
									>
										Remove
									</button>
								</form>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center py-8 text-gray-500">
						<svg class="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
						</svg>
						<p>No devices subscribed to push notifications</p>
						<p class="text-sm mt-2">Enable notifications in your browser to receive updates</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
