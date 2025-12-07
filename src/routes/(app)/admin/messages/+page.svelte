<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Messages Admin - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex justify-between items-center mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Messages</h1>
			<p class="text-gray-600 mt-1">
				{#if data.canViewAll}
					View all system communications
				{:else}
					Manage team communications
				{/if}
			</p>
		</div>
		<a href="/messages" class="btn-primary">
			Open Messaging
		</a>
	</div>

	{#if data.canViewAll}
		<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
			<p class="text-sm text-yellow-800">
				<strong>Admin View:</strong> You can see all conversations across the system.
			</p>
		</div>
	{/if}

	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold">Recent Conversations</h2>
		</div>
		<div class="divide-y divide-gray-200">
			{#if data.conversations.length === 0}
				<div class="p-8 text-center text-gray-500">
					No conversations yet
				</div>
			{:else}
				{#each data.conversations as conv}
					<a href="/messages/{conv.id}" class="block hover:bg-gray-50 p-4">
						<div class="flex items-start justify-between">
							<div class="flex-1 min-w-0">
								<div class="flex items-center space-x-2">
									<span class="px-2 py-0.5 text-xs font-medium rounded-full 
										{conv.type === 'broadcast' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">
										{conv.type}
									</span>
									{#if conv.title}
										<span class="font-medium text-gray-900">{conv.title}</span>
									{/if}
								</div>
								<div class="mt-1 text-sm text-gray-600">
									Participants: {conv.participants.map(p => p.name).join(', ')}
								</div>
								{#if conv.lastMessage}
									<p class="mt-1 text-sm text-gray-500 truncate">
										{conv.lastMessage}
									</p>
								{/if}
							</div>
							<div class="text-right text-sm text-gray-500">
								<div>{formatDate(conv.updatedAt)}</div>
								<div class="text-xs">{conv.messageCount} messages</div>
							</div>
						</div>
					</a>
				{/each}
			{/if}
		</div>
	</div>
</div>
