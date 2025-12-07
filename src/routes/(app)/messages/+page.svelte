<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: conversations = data.conversations;
	$: users = data.users;
	$: currentUser = data.user;

	let showNewChat = false;

	function getConversationName(conv: typeof conversations[0]) {
		if (conv.title) return conv.title;
		if (conv.type === 'broadcast') return 'Broadcast';
		const otherParticipants = conv.participants.filter((p: { id: string }) => p.id !== currentUser?.id);
		return otherParticipants.map((p: { name: string }) => p.name).join(', ') || 'Unknown';
	}

	function formatTime(dateStr: string | Date) {
		const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		if (diff < 60000) return 'Just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function closeModal() {
		showNewChat = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showNewChat = false;
		}
	}
</script>

<svelte:head>
	<title>Messages - TeamTime</title>
</svelte:head>

<div class="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-2rem)]">
	<div class="p-4 border-b bg-white">
		<div class="flex items-center justify-between">
			<h1 class="text-2xl font-bold">Messages</h1>
			<button on:click={() => showNewChat = true} class="btn-primary btn-sm">
				<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				New
			</button>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#each conversations as conv}
			<a href="/messages/{conv.id}" class="flex items-center p-4 hover:bg-gray-50 border-b {conv.unreadCount > 0 ? 'bg-primary-50' : ''}">
				<div class="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium flex-shrink-0">
					{getConversationName(conv).charAt(0).toUpperCase()}
				</div>
				<div class="ml-3 flex-1 min-w-0">
					<div class="flex items-center justify-between">
						<h3 class="font-semibold text-gray-900 truncate">{getConversationName(conv)}</h3>
						{#if conv.lastMessage}
							<span class="text-xs text-gray-500">{formatTime(conv.lastMessage.createdAt)}</span>
						{/if}
					</div>
					{#if conv.lastMessage}
						<p class="text-sm text-gray-600 truncate">
							{#if conv.lastMessage.senderName}
								<span class="font-medium">{conv.lastMessage.senderName}:</span>
							{/if}
							{conv.lastMessage.content}
						</p>
					{:else}
						<p class="text-sm text-gray-400 italic">No messages yet</p>
					{/if}
				</div>
				{#if conv.unreadCount > 0}
					<span class="ml-2 bg-primary-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
						{conv.unreadCount > 99 ? '99+' : conv.unreadCount}
					</span>
				{/if}
			</a>
		{:else}
			<div class="text-center py-12">
				<svg class="mx-auto w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
				</svg>
				<p class="mt-2 text-gray-600">No conversations yet</p>
				<button on:click={() => showNewChat = true} class="btn-primary mt-4">Start a Conversation</button>
			</div>
		{/each}
	</div>

	<!-- New Chat Modal -->
	{#if showNewChat}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end lg:items-center justify-center"
			on:click={closeModal}
			on:keydown={handleKeydown}
			role="button"
			tabindex="0"
		>
			<div
				class="bg-white w-full lg:max-w-md lg:rounded-xl rounded-t-xl max-h-[80vh] overflow-hidden"
				on:click|stopPropagation
				on:keydown|stopPropagation
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title"
			>
				<div class="p-4 border-b flex items-center justify-between">
					<h2 id="modal-title" class="text-lg font-semibold">New Message</h2>
					<button on:click={closeModal} class="text-gray-500">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div class="p-4 overflow-y-auto max-h-96">
					<p class="text-sm text-gray-600 mb-4">Select a person to message:</p>
					{#each users as user}
						<a
							href="/messages/new?userId={user.id}"
							class="flex items-center p-3 rounded-lg hover:bg-gray-100"
							on:click={closeModal}
						>
							<div class="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
								{user.name.charAt(0).toUpperCase()}
							</div>
							<div class="ml-3">
								<div class="font-medium">{user.name}</div>
								<div class="text-sm text-gray-500 capitalize">{user.role}</div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
